class CharactersController < ApplicationController
  def index
    @characters = Character.all
  end

  def show
    @character = Character.find(params[:id])
  end

  def new
    @character = Character.new
  end

  def create
    @character = Character.new(character_params)

    if @character.save
      redirect_to @character # Si se guarda bien, te lleva a ver su ficha
    else
      render :new # Si falla, te vuelve a mostrar el formulario
    end
  end

  def import
    @character = Character.new
  end

  def import_create
    @character = Character.new
    json_text = import_json_text

    begin
      payload = JSON.parse(json_text)
    rescue JSON::ParserError => e
      @character.errors.add(:base, "JSON inválido: #{e.message}")
      return render :import, status: :unprocessable_entity
    end

    attributes = payload.slice("name", "description", "aspects", "skills", "stunts", "extras")
    @character.assign_attributes(attributes)

    if @character.save
      redirect_to @character, notice: "Personaje importado correctamente."
    else
      render :import, status: :unprocessable_entity
    end
  end

  def edit
    @character = Character.find(params[:id])
  end

  def update
    @character = Character.find(params[:id])
    attributes = character_params.to_h

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
    @character = Character.find(params[:id])
    render json: @character.permanent_export
  end

  private

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
    :name, :description, :physical_stress, :mental_stress, :avatar, :fate_points,
    aspects: [:title, :name, :description],
    stunts: [:title, :skill, :description],
    extras: [],
    skills: { "4" => [], "3" => [], "2" => [], "1" => [] },
    physical_stress_slots: [],
    mental_stress_slots: []
  )
  end
end