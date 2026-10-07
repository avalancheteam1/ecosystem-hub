import { Logo } from './logo'

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-muted">
          <a href="https://team1.network" className="hover:text-fg-heading">team1.network</a>
          <a href="https://go.team1.network/privacy-policy" className="hover:text-fg-heading">Privacy policy</a>
        </nav>
        <p className="text-sm text-fg-faint">© {new Date().getFullYear()} team1</p>
      </div>
    </footer>
  )
}
