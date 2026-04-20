import type { Metadata } from 'next'
import { ProfileView } from '@/components/profile/profile-view'

export const metadata: Metadata = { title: 'Mi perfil | SIG-EPE' }

export default function ProfilePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Mi perfil</h1>
      <ProfileView />
    </div>
  )
}
