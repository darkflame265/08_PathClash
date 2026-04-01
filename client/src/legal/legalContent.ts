export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocumentContent = {
  title: string;
  updatedAt: string;
  intro: string[];
  sections: LegalSection[];
};

export const LEGAL_CONTENT = {
  kr: {
    terms: {
      title: "이용약관",
      updatedAt: "최종 수정일: 2026-03-14",
      intro: [
        "본 이용약관은 PathClash(이하 \"서비스\")의 이용과 관련된 조건을 규정합니다.",
        "서비스를 이용하면 본 약관에 동의한 것으로 봅니다.",
      ],
      sections: [
        {
          heading: "1. 서비스 개요",
          paragraphs: [
            "PathClash는 모바일과 웹에서 제공되는 온라인 게임 서비스입니다.",
            "게스트 로그인, 구글 계정 연동, 멀티플레이 매칭, AI 대전, 전적 저장, 가상 토큰, 스킨 구매 기능을 포함할 수 있습니다.",
          ],
        },
        {
          heading: "2. 계정",
          bullets: [
            "사용자는 게스트 계정 또는 구글 연동 계정을 통해 서비스를 이용할 수 있습니다.",
            "사용자는 자신의 계정 접근 정보를 스스로 관리해야 합니다.",
            "운영자는 악용, 사기, 정책 위반이 확인된 계정에 대해 이용 제한 또는 정지를 할 수 있습니다.",
          ],
        },
        {
          heading: "3. 공정한 이용",
          bullets: [
            "치트, 핵, 자동화, 버그 악용",
            "매칭 또는 전적을 인위적으로 조작하는 행위",
            "다른 사용자를 괴롭히거나 정상적인 플레이를 방해하는 행위",
            "서비스 또는 데이터에 대한 무단 접근 시도",
          ],
        },
        {
          heading: "4. 가상 재화",
          bullets: [
            "토큰 및 스킨은 서비스 내 전용 아이템입니다.",
            "해당 아이템은 서비스 밖의 실제 화폐 가치를 가지지 않습니다.",
            "운영자는 서비스 운영상 필요한 경우 가상 재화의 가격, 지급 방식, 제공 방식을 조정할 수 있습니다.",
          ],
        },
        {
          heading: "5. 결제 및 환불",
          bullets: [
            "인앱 결제는 Google Play와 같은 결제 플랫폼을 통해 처리됩니다.",
            "환불 가능 여부는 해당 결제 플랫폼의 정책에 따릅니다.",
            "결제가 완료되었으나 서비스에 정상 반영되지 않은 경우 운영자에게 문의할 수 있습니다.",
          ],
        },
        {
          heading: "6. 개인정보 및 데이터",
          paragraphs: [
            "서비스의 계정 정보 및 게임 데이터 처리는 개인정보처리방침에 따릅니다.",
          ],
        },
        {
          heading: "7. 서비스의 제공",
          bullets: [
            "운영자는 서비스의 내용을 변경, 중단, 종료할 수 있습니다.",
            "운영자는 서비스의 무중단 제공이나 무오류 상태를 보장하지 않습니다.",
          ],
        },
        {
          heading: "8. 책임 제한",
          paragraphs: [
            "관련 법령에서 허용되는 범위 내에서 운영자는 서비스 이용 과정에서 발생하는 간접적, 부수적, 결과적 손해에 대해 책임을 지지 않습니다.",
          ],
        },
        {
          heading: "9. 이용 제한 및 종료",
          paragraphs: [
            "운영자는 약관 위반, 보안 위협, 사기성 행위가 확인되는 경우 서비스 이용을 제한하거나 종료할 수 있습니다.",
          ],
        },
        {
          heading: "10. 약관 변경",
          paragraphs: [
            "본 약관이 변경될 수 있으며 최신 버전은 본 문서에서 확인할 수 있습니다.",
          ],
        },
        {
          heading: "11. 문의",
          paragraphs: ["이메일: ter2490@naver.com"],
        },
      ],
    } satisfies LegalDocumentContent,
    privacy: {
      title: "개인정보처리방침",
      updatedAt: "최종 수정일: 2026-03-05",
      intro: [
        "PathClash(이하 \"서비스\")는 게임 이용에 필요한 최소한의 개인정보만 처리합니다.",
        "본 개인정보처리방침은 앱 및 웹 버전(PathClash)에 공통으로 적용됩니다.",
      ],
      sections: [
        {
          heading: "1. 수집하는 정보",
          bullets: [
            "Supabase 익명 계정 ID",
            "Google 로그인 사용 시 Google 계정 식별자",
            "닉네임",
            "승패 전적 및 게임 이용 기록",
            "기기 및 브라우저 정보, 접속 로그, IP 주소",
          ],
        },
        {
          heading: "2. 정보 이용 목적",
          bullets: [
            "로그인 및 계정 연동 처리",
            "멀티플레이 매칭 및 게임 진행",
            "전적 저장 및 계정 간 데이터 연결",
            "서비스 보안 및 안정적인 운영",
            "오류 분석 및 서비스 개선",
          ],
        },
        {
          heading: "3. 보관 및 파기",
          bullets: [
            "계정 정보는 계정 삭제 요청 시까지 보관될 수 있습니다.",
            "게임 데이터는 서비스 운영 기간 동안 보관될 수 있습니다.",
            "접속 로그 및 기술 로그는 최대 30일 보관 후 삭제될 수 있습니다.",
          ],
        },
        {
          heading: "4. 제3자 서비스",
          bullets: [
            "Supabase: 사용자 인증 및 데이터베이스 처리",
            "Google OAuth: Google 계정 로그인 연동",
          ],
        },
        {
          heading: "5. 사용자의 권리",
          bullets: [
            "개인정보 열람 요청",
            "개인정보 수정 요청",
            "개인정보 삭제 요청",
          ],
        },
        {
          heading: "6. 데이터 삭제 요청",
          paragraphs: [
            "사용자는 이메일을 통해 계정 삭제 및 개인정보 삭제를 요청할 수 있습니다. 요청이 접수되면 확인 절차 후 합리적인 기간 내에 처리합니다.",
          ],
        },
        {
          heading: "7. 문의처",
          paragraphs: ["이메일: ter2490@naver.com"],
        },
        {
          heading: "8. 정책 변경",
          paragraphs: [
            "본 개인정보처리방침은 변경될 수 있으며 최신 내용은 본 문서에서 확인할 수 있습니다.",
          ],
        },
      ],
    } satisfies LegalDocumentContent,
  },
  en: {
    terms: {
      title: "Terms of Service",
      updatedAt: "Last updated: 2026-03-14",
      intro: [
        "These Terms of Service describe the conditions for using PathClash (the \"Service\").",
        "By using the Service, you agree to these terms.",
      ],
      sections: [
        {
          heading: "1. Service Overview",
          paragraphs: [
            "PathClash is an online game service available on mobile and web.",
            "The Service may include guest login, Google account linking, multiplayer matchmaking, AI battles, match history, virtual tokens, and cosmetic skin purchases.",
          ],
        },
        {
          heading: "2. Accounts",
          bullets: [
            "You may use the Service through a guest account or a Google-linked account.",
            "You are responsible for managing access to your account.",
            "We may restrict or suspend accounts involved in abuse, fraud, or policy violations.",
          ],
        },
        {
          heading: "3. Fair Use",
          bullets: [
            "Cheats, hacks, automation, or bug abuse",
            "Manipulating matchmaking or records",
            "Harassing other users or disrupting normal play",
            "Unauthorized access attempts against the Service or its data",
          ],
        },
        {
          heading: "4. Virtual Goods",
          bullets: [
            "Tokens and skins are in-service virtual items.",
            "They have no real-world cash value outside the Service.",
            "We may adjust pricing, rewards, or availability when needed for operation or balance.",
          ],
        },
        {
          heading: "5. Payments and Refunds",
          bullets: [
            "In-app purchases are processed by payment platforms such as Google Play.",
            "Refund availability follows the policy of the relevant payment platform.",
            "If a completed purchase is not properly reflected in the Service, you may contact support.",
          ],
        },
        {
          heading: "6. Personal Information and Data",
          paragraphs: [
            "Account information and gameplay data are handled according to the Privacy Policy.",
          ],
        },
        {
          heading: "7. Service Availability",
          bullets: [
            "We may change, suspend, or end parts of the Service.",
            "We do not guarantee uninterrupted or error-free availability.",
          ],
        },
        {
          heading: "8. Limitation of Liability",
          paragraphs: [
            "To the extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of the Service.",
          ],
        },
        {
          heading: "9. Restrictions and Termination",
          paragraphs: [
            "We may restrict or terminate access if we confirm a violation of these terms, a security risk, or fraudulent conduct.",
          ],
        },
        {
          heading: "10. Changes to These Terms",
          paragraphs: [
            "These terms may change, and the latest version will be shown in this document.",
          ],
        },
        {
          heading: "11. Contact",
          paragraphs: ["Email: ter2490@naver.com"],
        },
      ],
    } satisfies LegalDocumentContent,
    privacy: {
      title: "Privacy Policy",
      updatedAt: "Last updated: 2026-03-05",
      intro: [
        "PathClash (the \"Service\") processes only the minimum personal information needed to operate the game.",
        "This Privacy Policy applies to both the app and web versions of PathClash.",
      ],
      sections: [
        {
          heading: "1. Information We Collect",
          bullets: [
            "Supabase anonymous account ID",
            "Google account identifier when Google login is used",
            "Nickname",
            "Wins, losses, and gameplay records",
            "Device and browser information, access logs, and IP address",
          ],
        },
        {
          heading: "2. Why We Use Information",
          bullets: [
            "Authentication and account linking",
            "Matchmaking and gameplay operation",
            "Saving records and linking account data",
            "Security and service stability",
            "Error analysis and service improvement",
          ],
        },
        {
          heading: "3. Retention and Deletion",
          bullets: [
            "Account information may be retained until you request account deletion.",
            "Gameplay data may be retained while the Service is operated.",
            "Technical and access logs may be deleted after up to 30 days.",
          ],
        },
        {
          heading: "4. Third-Party Services",
          bullets: [
            "Supabase: authentication and database processing",
            "Google OAuth: Google sign-in integration",
          ],
        },
        {
          heading: "5. Your Rights",
          bullets: [
            "Request access to your personal data",
            "Request correction of your personal data",
            "Request deletion of your personal data",
          ],
        },
        {
          heading: "6. Data Deletion Requests",
          paragraphs: [
            "You may request account deletion and personal data deletion by email. After verification, we will process the request within a reasonable period.",
          ],
        },
        {
          heading: "7. Contact",
          paragraphs: ["Email: ter2490@naver.com"],
        },
        {
          heading: "8. Policy Changes",
          paragraphs: [
            "This Privacy Policy may change, and the latest version will be shown in this document.",
          ],
        },
      ],
    } satisfies LegalDocumentContent,
  },
} as const;
