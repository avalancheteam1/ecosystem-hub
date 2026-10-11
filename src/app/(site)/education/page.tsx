import { redirect } from 'next/navigation'

// ponytail: one academy so far - give /education its own index when a second one lands.
export default function EducationPage() {
  redirect('/education/entrepreneur')
}
