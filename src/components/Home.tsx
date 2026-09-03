import { ServiceCard } from './ServiceCard'

interface HomeProps {
  onSelectPassport: () => void
}

// Deliberately minimal — no marketing landing page (PRD §4/§11).
export function Home({ onSelectPassport }: HomeProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">NextMove</h1>
        <p className="mt-1 text-slate-500">Know what's holding things up. Know what to do next.</p>
      </div>
      <p className="text-lg font-semibold text-slate-900">What's stuck?</p>
      <div className="space-y-3">
        <ServiceCard
          label="Passport"
          description="Application pending, police verification, no movement"
          status="available"
          onSelect={onSelectPassport}
        />
        <ServiceCard
          label="Voter Services"
          description="Registration, corrections, SIR, electoral roll issues"
          status="visible_inactive"
        />
        <ServiceCard
          label="Income Certificate"
          description="State-specific workflow"
          status="coming_soon"
        />
      </div>
    </div>
  )
}
