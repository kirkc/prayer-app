import PrayerForm from '@/components/PrayerForm'

// Redemption's public form. Props are literals (not a DB lookup) so this page
// stays statically rendered and byte-stable — it is the consent/CTA evidence
// page registered with the A2P 10DLC campaign and must not drift. Other
// churches get the same form at /[slug], driven by their organizations row.
export default function HomePage() {
  return (
    <PrayerForm
      orgName="Redemption Church Seattle"
      smsNumber="(206) 888-6649"
      postUrl="/api/prayers"
      privacyHref="/privacy-policy.html"
      termsHref="/terms.html"
    />
  )
}
