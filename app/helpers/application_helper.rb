module ApplicationHelper
  # Renderiza el contenido de una nota: Markdown + tokens [image:ID] y [drawing:ID]
  def render_note_content(note)
    return "" if note.content.blank?

    html = simple_markdown(note.content.dup)
    html = resolve_note_tokens(html, note)
    html.html_safe
  end

  private

  # Markdown ligero sin dependencias externas
  def simple_markdown(text)
    text = CGI.escapeHTML(text)

    lines = text.split("\n")
    in_list = false
    result = []

    lines.each do |line|
      stripped = line.strip

      if stripped.match?(/\A\*\s/)
        # Item de lista
        unless in_list
          result << "<ul class='list-disc pl-5 space-y-1 my-2'>"
          in_list = true
        end
        item = stripped.sub(/\A\*\s/, "")
        result << "<li>#{process_inline_markdown(item)}</li>"
        next
      else
        if in_list
          result << "</ul>"
          in_list = false
        end
      end

      if stripped.start_with?("### ")
        result << "<h4 class='text-sm font-bold text-slate-800 mt-3 mb-1'>#{process_inline_markdown(stripped.sub(/\A###\s/, ''))}</h4>"
      elsif stripped.start_with?("## ")
        result << "<h3 class='text-base font-bold text-slate-800 mt-3 mb-1'>#{process_inline_markdown(stripped.sub(/\A##\s/, ''))}</h3>"
      elsif stripped.start_with?("# ")
        result << "<h2 class='text-lg font-bold text-slate-800 mt-3 mb-2'>#{process_inline_markdown(stripped.sub(/\A#\s/, ''))}</h2>"
      elsif stripped.empty?
        result << "<br>"
      else
        result << "<p class='text-sm text-slate-700 leading-relaxed'>#{process_inline_markdown(stripped)}</p>"
      end
    end

    result << "</ul>" if in_list
    result.join("\n")
  end

  def process_inline_markdown(text)
    # Negrita: **texto**
    text = text.gsub(/\*\*(.+?)\*\*/, '<strong class="font-bold text-slate-900">\\1</strong>')
    # Cursiva: *texto*
    text = text.gsub(/\*(.+?)\*/, '<em class="italic text-slate-600">\\1</em>')
    # Código inline: `texto`
    text = text.gsub(/`(.+?)`/, '<code class="bg-slate-100 text-amber-700 px-1 py-0.5 rounded text-xs font-mono">\\1</code>')
    text
  end

  # Reemplaza tokens [image:ID] por HTML con ActiveStorage
  # (Los dibujos ya no van en markdown, se muestran fuera)
  def resolve_note_tokens(html, note)
    html.gsub!(/\[image:([^\]]+)\]/) do
      url = blob_url_from_signed_id(Regexp.last_match(1))
      if url
        "<img src='#{url}' class='rounded-xl max-w-full h-auto my-2 border border-slate-200' loading='lazy' alt='Imagen'>"
      else
        "<span class='text-xs text-slate-400 italic'>[Imagen no disponible]</span>"
      end
    end
    # Limpiar tokens [drawing:...] antiguos (el dibujo se muestra fuera del markdown)
    html.gsub!(/\[drawing:[^\]]+\]/, "")
    html
  end

  # Busca un blob por signed_id y devuelve su URL pública
  def blob_url_from_signed_id(signed_id)
    blob = ActiveStorage::Blob.find_signed(signed_id)
    rails_blob_url(blob) if blob
  rescue StandardError
    nil
  end
end
