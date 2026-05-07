class Note < ApplicationRecord
  belongs_to :room
  belongs_to :user
  belongs_to :locked_by_user, class_name: "User", foreign_key: :locked_by_id, optional: true

  has_one_attached :drawing
  has_many_attached :images

  validates :title, presence: true

  scope :public_notes,  -> { where(public: true) }
  scope :private_notes, -> { where(public: false) }
  scope :for_user, ->(user) { where(user: user) }

  # ──────────────────────────
  # Locking
  # ──────────────────────────

  def locked?
    locked_by_id.present? && locked_at.present? && locked_at > 5.minutes.ago
  end

  def locked_by?(user)
    return false unless user
    locked? && locked_by_id == user.id
  end

  def acquire_lock!(user)
    return false if locked? && !locked_by?(user)
    update_columns(locked_by_id: user.id, locked_at: Time.current)
    # No broadcast: el editor reemplaza visualmente la tarjeta
    true
  end

  def release_lock!
    return unless locked?
    update!(locked_by_id: nil, locked_at: nil)
    broadcast_lock_status
  end

  def force_unlock!
    update!(locked_by_id: nil, locked_at: nil)
    broadcast_lock_status
  end

  # ──────────────────────────
  # Broadcasts condicionales
  # ──────────────────────────

  after_create_commit :broadcast_create
  after_update_commit :broadcast_update
  after_destroy_commit :broadcast_destroy

  private

  # Locals para viewers que NO son el dueño
  def guest_locals
    { note: self, is_owner: false, is_dm: false, can_edit: public?, locked_by_me: false }
  end

  # Locals para el dueño de la nota
  def owner_locals
    is_dm_val = (room.dm_id == user_id)
    {
      note: self, is_owner: true, is_dm: is_dm_val,
      can_edit: true, locked_by_me: locked_by?(user)
    }
  end

  # Locals para el DM (cuando no es el dueño)
  def dm_locals
    {
      note: self, is_owner: false, is_dm: true,
      can_edit: true, locked_by_me: locked_by?(room.dm)
    }
  end

  def broadcast_create
    if public?
      broadcast_append_to(
        room, target: "notes_list", partial: "rooms/note",
        locals: guest_locals
      )
    else
      # Privada: solo el DM (si no es el dueño) la ve
      broadcast_append_to(
        [room, room.dm], target: "notes_list", partial: "rooms/note",
        locals: dm_locals
      ) unless room.dm_id == user_id
    end
    # Dueño siempre la ve
    broadcast_append_to(
      [room, user], target: "notes_list", partial: "rooms/note",
      locals: owner_locals
    )
  end

  def broadcast_update
    if public?
      broadcast_replace_to(
        room, target: "note_#{id}", partial: "rooms/note",
        locals: guest_locals
      )
    else
      broadcast_replace_to(
        [room, room.dm], target: "note_#{id}", partial: "rooms/note",
        locals: dm_locals
      ) unless room.dm_id == user_id
    end

    broadcast_replace_to(
      [room, user], target: "note_#{id}", partial: "rooms/note",
      locals: owner_locals
    )
  end

  def broadcast_destroy
    broadcast_remove_to(room, target: "note_#{id}")
    broadcast_remove_to([room, user], target: "note_#{id}")
    broadcast_remove_to([room, room.dm], target: "note_#{id}") unless room.dm_id == user_id
  end

  def broadcast_lock_status
    if public?
      broadcast_replace_to(
        room, target: "note_#{id}", partial: "rooms/note",
        locals: guest_locals
      )
    else
      broadcast_replace_to(
        [room, room.dm], target: "note_#{id}", partial: "rooms/note",
        locals: dm_locals
      ) unless room.dm_id == user_id
    end

    broadcast_replace_to(
      [room, user], target: "note_#{id}", partial: "rooms/note",
      locals: owner_locals
    )
  end
end