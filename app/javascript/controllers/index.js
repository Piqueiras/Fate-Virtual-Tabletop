import { Application } from "@hotwired/stimulus"
import NestedFormController from "controllers/nested_form_controller"
import SkillPyramidController from "controllers/skill_pyramid_controller"
import StressController from "controllers/stress_controller"
import RoomBoardController from "controllers/room_board_controller"
import ItemModalController from "controllers/item_modal_controller"

const application = Application.start()
application.register("nested-form", NestedFormController)
application.register("skill-pyramid", SkillPyramidController)
application.register("stress", StressController)
application.register("room-board", RoomBoardController)
application.register("item-modal", ItemModalController)