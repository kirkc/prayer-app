import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { getOrgBySlug } from '@/lib/orgs'
import { formatPhoneDisplay } from '@/lib/phone'
import PrayerForm from '@/components/PrayerForm'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

// A church's public prayer-request form, driven by its organizations row.
// Churches without a texting number get the form with all SMS elements
// hidden. Redemption's form also lives at / (static, A2P evidence page);
// reserved app paths can never be slugs (checked in migration 012).
export default async function OrgFormPage({ params }: Params) {
  const { slug } = await params
  const org = await getOrgBySlug(createServiceClient(), slug).catch(() => null)
  if (!org) notFound()

  return (
    <PrayerForm
      orgName={org.name}
      smsNumber={org.twilio_phone ? formatPhoneDisplay(org.twilio_phone) : null}
      postUrl={`/api/orgs/${org.slug}/prayers`}
      privacyHref="/legal/privacy"
      termsHref="/legal/terms"
    />
  )
}
