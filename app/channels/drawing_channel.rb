class DrawingChannel < ApplicationCable::Channel
  def subscribed
    stream_from "drawing_room_#{params[:room_id]}"
  end

  def unsubscribed
    # Any cleanup needed when channel is unsubscribed
  end

  def draw(data)
    # Broadcast the drawing data to all other subscribers in the room
    ActionCable.server.broadcast(
      "drawing_room_#{params[:room_id]}",
      {
        action: "draw",
        stroke_id: data["stroke_id"],
        points: data["points"],
        color: data["color"],
        is_eraser: data["is_eraser"],
        line_width: data["line_width"],
        user_id: current_user&.id
      }
    )
  end

  def clear_canvas(data)
    ActionCable.server.broadcast(
      "drawing_room_#{params[:room_id]}",
      {
        action: "clear_canvas",
        user_id: current_user&.id
      }
    )
  end
end
