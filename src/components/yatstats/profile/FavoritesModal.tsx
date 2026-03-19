// src/components/yatstats/profile/FavoritesModal.tsx
// Favorites modal + toast for the player profile page.
// Event handling is wired by ProfileInteractivity.

export default function FavoritesModal() {
  return (
    <>
      <div className="fav-modal-mask" id="favModalMask" role="dialog" aria-modal="true">
        <div className="fav-modal">
          <button className="fav-modal-close" id="favModalClose" aria-label="Close modal">&times;</button>
          <h3>Save this player</h3>
          <p>Register free to follow favorites from this school, or become a Superfan for access across all schools.</p>
          <div className="fav-modal-actions">
            <button id="favRegister">Register Free</button>
            <button id="favUpgrade">Become a Superfan</button>
          </div>
        </div>
      </div>
      <div className="fav-toast" id="favToast" role="status" aria-live="polite" />
    </>
  );
}
