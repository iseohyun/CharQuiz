/**
 * @file functions/index.js
 * @description CharQuiz (Firebase Project: kana-loop) Cloud Functions v2 백엔드
 * - sendInstantNotification / scheduleNotification: 복습 푸시 알림 발송 및 예약
 * - naverLogin / kakaoLogin: 소셜 OAuth 코드 교환, 이메일 기반 계정 통합(방식 A) 및 커스텀 토큰 발급
 */

const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");
const {CloudTasksClient} = require("@google-cloud/tasks");

admin.initializeApp();

const tasksClient = new CloudTasksClient();
const PROGRESS_DOMAINS = ["hira", "kata", "hangle", "ENGLISH", "english"];

/**
 * 임시 소셜 계정(sourceUid)에 쌓여 있던 Firestore 진도 데이터를 통합 계정(targetUid)으로 안전 병합한다.
 * targetUid 에 이미 더 최신 기록이 있는 문자는 덮어쓰지 않는다.
 * @param {string} sourceUid 기존 임시 소셜 UID (예: kakao:49443...)
 * @param {string} targetUid 통합 대상 기존 계정 UID
 */
async function mergeFirestoreUserProgress(sourceUid, targetUid) {
  if (!sourceUid || !targetUid || sourceUid === targetUid) return;
  const db = admin.firestore();

  try {
    for (const domain of PROGRESS_DOMAINS) {
      const srcCol = db.collection("users").doc(sourceUid)
          .collection("progress").doc(domain).collection("chars");
      const srcSnap = await srcCol.get();
      if (srcSnap.empty) continue;

      const dstCol = db.collection("users").doc(targetUid)
          .collection("progress").doc(domain).collection("chars");
      const dstSnap = await dstCol.get();
      const dstMap = {};
      dstSnap.forEach((docSnap) => {
        dstMap[docSnap.id] = docSnap.data();
      });

      const batch = db.batch();
      let writeCount = 0;

      srcSnap.forEach((docSnap) => {
        const srcData = docSnap.data();
        const dstData = dstMap[docSnap.id];
        const srcTime = srcData.lastSessionTime || srcData.updatedAt || 0;
        const dstTime = dstData ? (dstData.lastSessionTime || dstData.updatedAt || 0) : -1;

        if (!dstData || srcTime > dstTime) {
          batch.set(dstCol.doc(docSnap.id), srcData, {merge: true});
          writeCount++;
        }
      });

      if (writeCount > 0) {
        batch.set(
            db.collection("users").doc(targetUid),
            {progressMeta: {[domain]: Date.now()}},
            {merge: true},
        );
        await batch.commit();
        console.log(`[AccountMerge] ${sourceUid} -> ${targetUid} (${domain}: ${writeCount}건 병합)`);
      }
    }
  } catch (err) {
    console.warn(`[AccountMerge] 진도 병합 중 경고 (${sourceUid} -> ${targetUid}):`, err.message);
  }
}

/**
 * 소셜 프로필을 기반으로 Firebase Auth 사용자를 조회/갱신/통합(방식 A)하고 최종 UID를 반환한다.
 * - 실제 이메일(realEmail)이 다른 기존 계정(Google/네이버 등)에 등록되어 있으면 그 계정으로 통합한다.
 * - 기존 소셜 계정이 임시 이메일(@kakao.com / @naver.com) 상태였다면 실제 이메일로 즉시 교체한다.
 * @param {object} params
 * @return {Promise<string>} 로그인할 최종 Firebase UID
 */
async function resolveOrLinkSocialUser({
  providerUid,
  realEmail,
  fallbackEmail,
  name,
  defaultName,
  photoURL,
  isEmailVerified,
}) {
  const hasMeaningfulName = Boolean(name && name !== defaultName);

  // 1. 실제 이메일이 제공된 경우
  if (realEmail) {
    let emailOwner = null;
    try {
      emailOwner = await admin.auth().getUserByEmail(realEmail);
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
    }

    // 1-A. 같은 이메일을 가진 기존 계정(예: Google/네이버)이 이미 존재하는 경우 -> 해당 계정으로 통합
    if (emailOwner && emailOwner.uid !== providerUid) {
      console.log(`[SocialAuth] 기존 계정(${realEmail})으로 통합 연결: ${providerUid} -> ${emailOwner.uid}`);
      await mergeFirestoreUserProgress(providerUid, emailOwner.uid);
      return emailOwner.uid;
    }

    // 1-B. 이미 본인(providerUid)에게 실제 이메일이 등록되어 있는 경우 -> 프로필 최신화
    if (emailOwner && emailOwner.uid === providerUid) {
      const updates = {};
      if (hasMeaningfulName && emailOwner.displayName !== name) updates.displayName = name;
      if (photoURL && emailOwner.photoURL !== photoURL) updates.photoURL = photoURL;
      if (Object.keys(updates).length > 0) {
        await admin.auth().updateUser(providerUid, updates);
      }
      return providerUid;
    }

    // 1-C. 실제 이메일을 쓰는 계정이 아직 없는 경우 -> 기존 임시 계정의 이메일을 교체하거나 신규 생성
    try {
      const existingProviderUser = await admin.auth().getUser(providerUid);
      const updates = {
        email: realEmail,
        emailVerified: Boolean(isEmailVerified),
      };
      if (hasMeaningfulName) updates.displayName = name;
      if (photoURL) updates.photoURL = photoURL;

      await admin.auth().updateUser(providerUid, updates);
      console.log(
          `[SocialAuth] 기존 계정(${providerUid}) 임시 이메일(${existingProviderUser.email}) -> 실제 이메일(${realEmail}) 갱신 완료`,
      );
      return providerUid;
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
      const createPayload = {
        uid: providerUid,
        email: realEmail,
        emailVerified: Boolean(isEmailVerified),
        displayName: name,
      };
      if (photoURL) createPayload.photoURL = photoURL;
      await admin.auth().createUser(createPayload);
      console.log(`[SocialAuth] 신규 소셜 유저 생성 완료: ${providerUid} (${realEmail})`);
      return providerUid;
    }
  }

  // 2. 실제 이메일이 제공되지 않은 경우 (미동의 또는 전화번호 전용 계정) -> 임시 이메일로 유지/생성
  try {
    await admin.auth().getUser(providerUid);
    const updates = {};
    if (hasMeaningfulName) updates.displayName = name;
    if (photoURL) updates.photoURL = photoURL;
    if (Object.keys(updates).length > 0) {
      await admin.auth().updateUser(providerUid, updates);
    }
    return providerUid;
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    const createPayload = {
      uid: providerUid,
      email: fallbackEmail,
      displayName: name,
    };
    if (photoURL) createPayload.photoURL = photoURL;
    await admin.auth().createUser(createPayload);
    return providerUid;
  }
}

// [A] 즉시 발송 API
exports.sendInstantNotification = onRequest(
    {cors: true, invoker: "public"},
    async (req, res) => {
      try {
        const {token, title, body} = req.body;
        const message = {
          notification: {title, body},
          token: token,
        };
        const response = await admin.messaging().send(message);
        res.status(200).send({success: true, messageId: response});
      } catch (error) {
        res.status(500).send({success: false, error: error.message});
      }
    },
);

// [B] 예약 발송 스케줄러 등록 API (Cloud Tasks 연동)
exports.scheduleNotification = onRequest(
    {cors: true, invoker: "public"},
    async (req, res) => {
      try {
        const {token, title, body, scheduleTime} = req.body;
        const project = process.env.GCLOUD_PROJECT;
        const location = "asia-northeast3";
        const queue = "notification-queue";
        const url = `https://${location}-${project}.cloudfunctions.net/sendInstantNotification`;

        const queuePath = tasksClient.queuePath(project, location, queue);
        const task = {
          httpRequest: {
            httpMethod: "POST",
            url: url,
            headers: {"Content-Type": "application/json"},
            body: Buffer.from(JSON.stringify({token, title, body})).toString("base64"),
          },
          scheduleTime: {
            seconds: Math.floor(new Date(scheduleTime).getTime() / 1000),
          },
        };

        const [response] = await tasksClient.createTask({parent: queuePath, task});
        res.status(200).send({success: true, taskName: response.name});
      } catch (error) {
        res.status(500).send({success: false, error: error.message});
      }
    },
);

// [C] 네이버 로그인 API
exports.naverLogin = onRequest(
    {cors: true, invoker: "public"},
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const {code, state} = req.body;
      if (!code) {
        res.status(400).send("인증 코드가 없습니다.");
        return;
      }

      const clientId = process.env.NAVER_CLIENT_ID || "hemXaBshyStfBhmNg05m";
      const clientSecret = process.env.NAVER_CLIENT_SECRET;
      if (!clientSecret) {
        res.status(500).json({error: "NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다."});
        return;
      }

      try {
        const tokenResponse = await axios.get("https://nid.naver.com/oauth2.0/token", {
          params: {
            grant_type: "authorization_code",
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            state: state || "state",
          },
        });

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) throw new Error("네이버 Access Token 발급 실패");

        const profileResponse = await axios.get("https://openapi.naver.com/v1/nid/me", {
          headers: {Authorization: `Bearer ${accessToken}`},
        });

        const profile = profileResponse.data.response;
        if (!profile || !profile.id) throw new Error("프로필 조회 실패");

        const providerUid = `naver:${profile.id}`;
        const realEmail = profile.email ? profile.email.trim().toLowerCase() : null;
        const fallbackEmail = `${profile.id}@naver.com`.toLowerCase();
        const name = profile.name || profile.nickname || "네이버 유저";
        const photoURL = profile.profile_image || undefined;

        const firebaseUid = await resolveOrLinkSocialUser({
          providerUid,
          realEmail,
          fallbackEmail,
          name,
          defaultName: "네이버 유저",
          photoURL,
          isEmailVerified: Boolean(realEmail),
        });

        const firebaseToken = await admin.auth().createCustomToken(firebaseUid);
        res.status(200).json({firebaseToken});
      } catch (error) {
        console.error("네이버 로그인 처리 에러:", error);
        res.status(500).json({error: error.message});
      }
    },
);

// [D] 카카오 로그인 API
exports.kakaoLogin = onRequest(
    {cors: true, invoker: "public"},
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const {code, redirectUri} = req.body;
      if (!code) {
        res.status(400).send("인증 코드가 없습니다.");
        return;
      }

      const clientId = process.env.KAKAO_REST_API_KEY || "af28f94aa8260ab663fd27dffea1ee77";
      const currentRedirectUri = redirectUri || "https://iseohyun.com/CharQuiz/";

      try {
        const tokenParams = {
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: currentRedirectUri,
          code: code,
        };
        if (process.env.KAKAO_CLIENT_SECRET) {
          tokenParams.client_secret = process.env.KAKAO_CLIENT_SECRET;
        }

        const tokenPayload = new URLSearchParams(tokenParams);
        const tokenResponse = await axios.post(
            "https://kauth.kakao.com/oauth/token",
            tokenPayload.toString(),
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
              },
            },
        );

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) throw new Error("카카오 Access Token 발급 실패");

        const profileResponse = await axios.get("https://kapi.kakao.com/v2/user/me", {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          },
        });

        const profile = profileResponse.data;
        if (!profile || !profile.id) throw new Error("프로필 조회 실패");

        const providerUid = `kakao:${profile.id}`;
        const kakaoAccount = profile.kakao_account || {};
        const isEmailValid = kakaoAccount.is_email_valid !== false;
        const realEmail = (kakaoAccount.email && isEmailValid) ?
          kakaoAccount.email.trim().toLowerCase() :
          null;
        const fallbackEmail = `${profile.id}@kakao.com`.toLowerCase();
        const name = profile.properties?.nickname ||
          kakaoAccount.profile?.nickname ||
          "카카오 유저";
        const photoURL = kakaoAccount.profile?.profile_image_url ||
          profile.properties?.profile_image ||
          undefined;

        console.log(
            `[Kakao Login] id=${profile.id}, name=${name}, ` +
            `hasRealEmail=${Boolean(realEmail)}, emailNeedsAgreement=${Boolean(kakaoAccount.email_needs_agreement)}`,
        );

        const firebaseUid = await resolveOrLinkSocialUser({
          providerUid,
          realEmail,
          fallbackEmail,
          name,
          defaultName: "카카오 유저",
          photoURL,
          isEmailVerified: Boolean(kakaoAccount.is_email_verified),
        });

        const firebaseToken = await admin.auth().createCustomToken(firebaseUid);
        res.status(200).json({
          firebaseToken,
          emailNeedsAgreement: Boolean(kakaoAccount.email_needs_agreement),
        });
      } catch (error) {
        const errorData = error.response ? error.response.data : null;
        const errorDetail = errorData || error.message;

        console.error("카카오 로그인 처리 에러 상세:", {
          message: error.message,
          status: error.response?.status,
          data: errorData,
        });
        res.status(500).json({error: errorDetail});
      }
    },
);
