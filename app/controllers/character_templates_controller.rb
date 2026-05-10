class CharacterTemplatesController < ApplicationController
  before_action :authenticate_user!
  before_action :set_template, only: %i[edit update destroy create_character]

  def index
    @templates = current_user.character_templates.order(updated_at: :desc)
  end

  def new
    @template = current_user.character_templates.new
  end

  def create
    # Si viene de character_id, es "guardar como plantilla" desde un personaje
    if params[:character_id].present?
      character = current_user.characters.find(params[:character_id])
      @template = current_user.character_templates.new(
        name: "#{character.name} (plantilla)",
        description: character.description,
        aspects: character.aspects,
        skills: character.skills,
        stunts: character.stunts,
        extras: character.extras,
        consequences: character.consequences,
        skills_private: character.skills_private
      )

      if @template.save
        # Copiar avatar si tiene
        if character.avatar.attached?
          @template.avatar.attach(character.avatar.blob)
        end

        redirect_to character_templates_path, notice: "Plantilla creada a partir de «#{character.name}»."
      else
        redirect_to character_path(character), alert: "No se pudo crear la plantilla: #{@template.errors.full_messages.join(', ')}"
      end
    else
      # Crear plantilla desde el formulario nuevo
      attrs = template_params.to_h

      # Convertir aspects de hash con índices a array de hashes
      if attrs[:aspects].is_a?(Hash)
        attrs[:aspects] = attrs[:aspects].values
      end

      # Convertir stunts de hash con índices a array de hashes
      if attrs[:stunts].is_a?(Hash)
        attrs[:stunts] = attrs[:stunts].values
      end

      @template = current_user.character_templates.new(attrs)
      if @template.save
        redirect_to character_templates_path, notice: "Plantilla creada correctamente."
      else
        render :new, status: :unprocessable_entity
      end
    end
  end

  def edit
  end

  def update
    attrs = template_params.to_h

    # Convertir aspects de hash con índices a array de hashes
    if attrs[:aspects].is_a?(Hash)
      attrs[:aspects] = attrs[:aspects].values
    end

    # Convertir stunts de hash con índices a array de hashes
    if attrs[:stunts].is_a?(Hash)
      attrs[:stunts] = attrs[:stunts].values
    end

    if @template.update(attrs)
      redirect_to character_templates_path, notice: "Plantilla actualizada."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @template.destroy
    redirect_to character_templates_path, notice: "Plantilla eliminada."
  end

  def create_character
    new_name = params[:character_name].presence

    character = @template.build_character(override_name: new_name)

    if character.save
      # Copiar avatar de la plantilla al personaje si existe
      if @template.avatar.attached?
        character.avatar.attach(@template.avatar.blob)
      end

      redirect_to character_path(character), notice: "Personaje «#{character.name}» creado a partir de la plantilla."
    else
      redirect_to character_templates_path, alert: "Error al crear personaje: #{character.errors.full_messages.join(', ')}"
    end
  end

  private

  def set_template
    @template = current_user.character_templates.find(params[:id])
  end

  def template_params
    params.require(:character_template).permit(
      :name, :description, :avatar, :skills_private,
      aspects: [:title, :name, :description, :private],
      stunts: [:title, :skill, :description, :private],
      extras: [],
      consequences: [],
      skills: { "5" => [], "4" => [], "3" => [], "2" => [], "1" => [], "-1" => [] }
    )
  end
end