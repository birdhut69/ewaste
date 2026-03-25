/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APPWRITE_ENDPOINT: string
  readonly VITE_APPWRITE_PROJECT_ID: string
  readonly VITE_APPWRITE_DB_ID: string
  readonly VITE_APPWRITE_BUCKET_PHOTOS: string
  readonly VITE_APPWRITE_TEAM_ID_DRIVER: string
  readonly VITE_APPWRITE_TEAM_ID_PMC: string
  readonly VITE_PUSH_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
