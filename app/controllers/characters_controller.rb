class CharactersController < ApplicationController
  before_action :authenticate_user!
  before_action :set_show_character, only: %i[show export destroy]
  before_action :set_character, only: %i[edit update toggle_visibility]

  def index
    @characters = current_user.characters
  end

  def public
    @characters = Character.publicly_visible.where.not(user_id: current_user.id).includes(:user)
  end

  def show
    if params[:room_id]
      @room = Room.find_by(id: params[:room_id])
    end
  end

  def new
    @character = current_user.characters.new
  end

  def create
    @character = current_user.characters.new(character_params)

    if @character.save
      redirect_to @character # Si se guarda bien, te lleva a ver su ficha
    else
      render :new # Si falla, te vuelve a mostrar el formulario
    end
  end

  def import
    @character = current_user.characters.new
  end

  def import_create
    @character = current_user.characters.new
    json_text = import_json_text

    begin
      payload = JSON.parse(json_text)
    rescue JSON::ParserError => e
      @character.errors.add(:base, "JSON inválido: #{e.message}")
      return render :import, status: :unprocessable_entity
    end

    attributes = payload.slice("name", "description", "aspects", "skills", "stunts", "extras", "consequences")
    @character.assign_attributes(attributes)

    if @character.save
      redirect_to @character, notice: "Personaje importado correctamente."
    else
      render :import, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    attributes = character_params.to_h

    # Convertir aspects de hash con índices a array de hashes
    if attributes[:aspects].is_a?(Hash)
      attributes[:aspects] = attributes[:aspects].values
    end

    # Convertir stunts de hash con índices a array de hashes
    if attributes[:stunts].is_a?(Hash)
      attributes[:stunts] = attributes[:stunts].values
    end

    if params[:character][:physical_stress_slots]
      attributes[:physical_stress] = Character.stress_mask_for_slots(params[:character][:physical_stress_slots])
      attributes.except!(:physical_stress_slots)
    end

    if params[:character][:mental_stress_slots]
      attributes[:mental_stress] = Character.stress_mask_for_slots(params[:character][:mental_stress_slots])
      attributes.except!(:mental_stress_slots)
    end

    attributes[:fate_points] = [attributes[:fate_points].to_i, 0].max if attributes.key?(:fate_points)

    if @character.update(attributes)
      respond_to do |format|
        format.html { redirect_to @character, notice: "¡Personaje actualizado con éxito!" }
        format.json { render json: { fate_points: @character.fate_points, physical_stress: @character.physical_stress, mental_stress: @character.mental_stress } }
      end
    else
      respond_to do |format|
        format.html { render :edit, status: :unprocessable_entity }
        format.json { render json: { errors: @character.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def export
    render json: @character.permanent_export
  end

  def destroy
    @character.destroy
    redirect_to characters_path, notice: "Personaje eliminado."
  end

  def toggle_visibility
    @character.update(is_secret: !@character.is_secret)
    notice = @character.is_secret ? "Personaje marcado como privado." : "Personaje marcado como público."
    redirect_to @character, notice: notice
  end

  private

  def set_show_character
    @character = current_user.characters.find_by(id: params[:id]) || Character.publicly_visible.find(params[:id])
  end

  def set_character
    # El dueño del personaje
    @character = current_user.characters.find_by(id: params[:id])

    # Si no es el dueño, comprobar si es DM en alguna sala donde esté este personaje
    if @character.nil?
      @character = Character.joins(:room_characters).where(room_characters: { room: current_user.rooms }).find_by(id: params[:id])
    end

    # Si sigue sin encontrar, no autorizado
    render json: { error: "No autorizado" }, status: :forbidden and return if @character.nil?
  end

  def import_json_text
    if params.dig(:character_import, :json).present?
      params[:character_import][:json]
    elsif params.dig(:character_import, :file).present?
      params[:character_import][:file].read
    else
      ""
    end
  end

  def character_params
  # Observa cómo permitimos 'aspects' como una lista de objetos con título, nombre y descripción,
  # y 'skills' como un objeto que puede recibir cualquier clave.
  params.require(:character).permit(
    :name, :description, :physical_stress, :mental_stress, :avatar, :fate_points, :skills_private,
    aspects: [:title, :name, :description, :private],
    stunts: [:title, :skill, :description, :private],
    extras: [],
    consequences: [],
    skills: { "5" => [], "4" => [], "3" => [], "2" => [], "1" => [], "-1" => [] },
    physical_stress_slots: [],
    mental_stress_slots: []
  )
  end
end