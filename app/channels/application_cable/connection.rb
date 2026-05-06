module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user
    end

    private

    def find_verified_user
      if (user_id = cookies.signed["user.id"])
        user = User.find_by(id: user_id)
      elsif (user_id = session["warden.user.user.key"]&.flatten&.first)
        user = User.find_by(id: user_id)
      end
      user || reject_unauthorized_connection
    end

    def session
      @request.session
    end
  end
end
