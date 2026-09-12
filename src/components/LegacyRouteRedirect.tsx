import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { legacyRouteDestination } from '@/lib/routing'

/** Also accept old links pasted into the address bar while the app is running. */
export function LegacyRouteRedirect() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const destination = legacyRouteDestination(location.hash)
    if (destination !== null) navigate(destination, { replace: true })
  }, [location.hash, navigate])
  return null
}
