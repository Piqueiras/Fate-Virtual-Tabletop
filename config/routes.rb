Rails.application.routes.draw do
  devise_for :users, skip: [:passwords]
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  resources :characters do
    collection do
      get :import
      post :import_create
      get :public
    end

    member do
      get :export
      patch :toggle_visibility
    end
  end

  resources :rooms, only: %i[index new create show update] do
    resources :room_characters, only: %i[create update destroy]
    resources :game_logs, only: %i[create]
    delete :clear_game_logs, on: :member
  end

  root "home#index"
end
