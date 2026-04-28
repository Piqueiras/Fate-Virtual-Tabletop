class HomeController < ApplicationController
  def index
    @rooms_count = Room.count
    @characters_count = user_signed_in? ? current_user.characters.count : 0
  end
end
