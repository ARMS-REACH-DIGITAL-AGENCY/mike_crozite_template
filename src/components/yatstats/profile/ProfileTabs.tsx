// src/components/yatstats/profile/ProfileTabs.tsx
// The tab bar for the player profile page.
// Tab switching is handled client-side by ProfileInteractivity.

export default function ProfileTabs() {
  return (
    <div className="profile-tabs" role="tablist">
      <div role="tab" className="profile-tab active" data-profile-tab="overview" tabIndex={0}>GAME LOG</div>
      <div role="tab" className="profile-tab" data-profile-tab="stats" tabIndex={0}>STATS</div>
      <div role="tab" className="profile-tab" data-profile-tab="news" tabIndex={0}>NEWS &amp; VIDEOS</div>
      <div role="tab" className="profile-tab" data-profile-tab="social" tabIndex={0}>SOCIAL MEDIA</div>
      <div role="tab" className="profile-tab" data-profile-tab="mentor" tabIndex={0}>MENTORSHIP MARKETPLACE</div>
      <div role="tab" className="profile-tab" data-profile-tab="gallery" tabIndex={0}>PHOTO GALLERY</div>
    </div>
  );
}
