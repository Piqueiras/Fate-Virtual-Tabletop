# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_04_26_171644) do
  create_table "characters", force: :cascade do |t|
    t.json "aspects"
    t.datetime "created_at", null: false
    t.text "description"
    t.json "extras"
    t.integer "fate_points"
    t.boolean "is_secret"
    t.integer "mental_stress"
    t.string "name"
    t.integer "physical_stress"
    t.json "skills"
    t.json "stunts"
    t.datetime "updated_at", null: false
  end
end
