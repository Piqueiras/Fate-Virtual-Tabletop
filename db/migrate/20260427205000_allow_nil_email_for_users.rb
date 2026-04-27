class AllowNilEmailForUsers < ActiveRecord::Migration[8.1]
  def change
    change_column_default :users, :email, from: "", to: nil
    change_column_null :users, :email, true
  end
end
