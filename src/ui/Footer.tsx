/** Site-wide chrome, shown beneath every screen — same convention as
 *  Topbar: service-agnostic copy lives in `SCREEN_COPY.ui` (screenCopy.ts),
 *  not inline here. */
import { UI } from '../screens/screenCopy'

export function Footer() {
  return (
    <footer className="footer">
      <span>{UI.footer.copyright}</span>
    </footer>
  )
}
