import { createBrowserClient } from '@supabase/ssr'

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          if (!isBrowser) return null
          const cookies = document.cookie.split('; ')
          const cookie = cookies.find(c => c.startsWith(name + '='))
          return cookie ? decodeURIComponent(cookie.split('=')[1]) : null
        },
        set(name: string, value: string, options: any) {
          if (!isBrowser) return
          let cookieString = `${name}=${encodeURIComponent(value)}`

          if (options?.maxAge) {
            cookieString += `; max-age=${options.maxAge}`
          }
          if (options?.domain) {
            cookieString += `; domain=${options.domain}`
          }
          if (options?.path) {
            cookieString += `; path=${options.path}`
          } else {
            cookieString += '; path=/'
          }
          if (options?.sameSite) {
            cookieString += `; samesite=${options.sameSite}`
          }
          if (options?.secure) {
            cookieString += '; secure'
          }

          document.cookie = cookieString
        },
        remove(name: string, options: any) {
          if (!isBrowser) return
          document.cookie = `${name}=; path=/; max-age=0`
        },
      },
    }
  )
}
