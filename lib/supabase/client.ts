import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const cookies = document.cookie.split('; ')
          const cookie = cookies.find(c => c.startsWith(name + '='))
          return cookie ? decodeURIComponent(cookie.split('=')[1]) : null
        },
        set(name: string, value: string, options: any) {
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
          document.cookie = `${name}=; path=/; max-age=0`
        },
      },
    }
  )
}
