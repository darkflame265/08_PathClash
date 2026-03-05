# Android Release Signing Guide (PathClash)

## 1) 업로드 키 생성 (최초 1회)

`client/android` 기준:

```bash
keytool -genkeypair -v -keystore release-keystore.jks -alias pathclash-upload -keyalg RSA -keysize 2048 -validity 10000
```

생성 파일:
- `client/android/release-keystore.jks`

## 2) keystore.properties 생성

```bash
cp keystore.properties.example keystore.properties
```

`client/android/keystore.properties`에 실제 값 입력:

```properties
storeFile=release-keystore.jks
storePassword=...
keyAlias=pathclash-upload
keyPassword=...
```

주의:
- `keystore.properties`, `.jks`는 Git 커밋 금지
- 키 유실 시 업데이트 불가 위험이 있으므로 안전한 백업 필수

## 3) 릴리즈 번들 생성 (.aab)

Android Studio:
- Build > Generate Signed Bundle / APK > Android App Bundle

또는 Gradle:

```bash
cd client/android
./gradlew bundleRelease
```

Windows(PowerShell) 권장:

```bash
cd client
npm run build
npm run android:sync
npm run android:bundle
```

산출물:
- `client/android/app/build/outputs/bundle/release/app-release.aab`

## 4) 배포 전 체크

- `applicationId`: `com.pathclash.game`
- `versionCode` 증가
- `versionName` 업데이트
- Google/Supabase OAuth 설정 일치 확인
