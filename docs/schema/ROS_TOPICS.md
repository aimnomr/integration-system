# ROS Topics

ROS topics exposed by the robot. The available set depends on the launch mode.

## Topics consumed directly by the React frontend (Phase 3)

The browser opens its own rosbridge WebSocket per robot (URL from `GET /fleet`)
for the high-frequency lanes — these bypass FastAPI and Node-RED entirely.

| Topic                                              | Message type                                     | UI use |
|----------------------------------------------------|--------------------------------------------------|--------|
| `/reference/map`                                   | `nav_msgs/OccupancyGrid`                         | MapCanvas — live SLAM map |
| `/amcl_pose`                                       | `geometry_msgs/PoseWithCovarianceStamped`        | MapCanvas robot arrow (primary) |
| `/robot_pose_ekf_node/odom_combined`               | `geometry_msgs/PoseWithCovarianceStamped`        | MapCanvas robot arrow (fallback if AMCL silent > 2 s) |
| `/move_base_node/DWAPlannerROS/global_plan`        | `nav_msgs/Path`                                  | MapCanvas — sky overlay |
| `/move_base_node/DWAPlannerROS/local_plan`         | `nav_msgs/Path`                                  | MapCanvas — red overlay |
| `/camera/front/image_raw/compressed`               | `sensor_msgs/CompressedImage`                    | Teleop — CameraStream |
| `/web_teleop/cmd_vel`                              | `geometry_msgs/Twist`                            | Teleop — KeyboardPad publishes here |

Angles in UI code are **degrees** at the JS layer; the quaternion conversion
happens at the rosbridge boundary (`src/helper/angleHelper.ts`). Goals sent via
the FastAPI `/order` endpoint use VDA5050 conventions (radians, `frame_id =
'map'`) — handled by FastAPI / ROS Bridge, not the browser.

## Topics used by the ROS Bridge service (backend)

The bridge holds its own rosbridge WebSocket per robot (separate from the
browser's) and translates between ROS and VDA5050. This is its full ROS
interface — the navigation lane that turns a VDA5050 `order` into motion:

| Topic | Message type | Direction | Used by |
|---|---|---|---|
| `/diff_controller/odom` | `nav_msgs/Odometry` | subscribe | `OdomBridge` — `state.velocity` + driving flag |
| `/amcl_pose` | `geometry_msgs/PoseWithCovarianceStamped` | subscribe | `PoseBridge` — `state.agvPosition` (`mapping:=false` only) |
| `/move_base/status` | `actionlib_msgs/GoalStatusArray` | subscribe | `OrderStateMachine` — goal lifecycle |
| `/move_base/result` | `move_base_msgs/MoveBaseActionResult` | subscribe | `OrderStateMachine` — the node-advance trigger (`SUCCEEDED` → next node) |
| `/move_base_simple/goal` | `geometry_msgs/PoseStamped` | publish | `OrderStateMachine` — one goal per node |
| `/move_base/cancel` | `actionlib_msgs/GoalID` | publish | `OrderStateMachine` — `cancelOrder` |

The two published topics are **configurable** via env vars — `NAV_GOAL_TOPIC`
(default `/move_base_simple/goal`) and `CANCEL_TOPIC` (default
`/move_base/cancel`) — so the bridge can target a different navigation stack
without code changes. See [running-locally.md](../getting-started/running-locally.md)
and [ros-bridge-service.md](../reference/services/ros-bridge-service.md).

> **Two launch modes.**
> - **`mapping:=true`** — SLAM / mapping mode; the robot builds a map (gmapping).
>   136 topics. Includes `/gmapping_node/entropy`; **no** AMCL topics.
> - **`mapping:=false`** — localization + navigation mode; the robot localizes
>   against an existing map using AMCL. 143 topics. Includes `/amcl_pose`,
>   `/amcl_node/*`, and `/particlecloud`.
>
> **For the integration:** `/amcl_pose` (the map-frame pose) is available **only** in
> `mapping:=false` mode. It is the AGV pose source for the VDA5050
> `state.agvPosition` — see [VDA5050_MESSAGES.md](VDA5050_MESSAGES.md).
>
> Integration-relevant topics today — present in both modes: `/diff_controller/odom`,
> `/move_base/status`, `/move_base/result` (subscribed); `/move_base_simple/goal` and
> `/move_base/cancel` (published). The full backend set is tabled above.
> See [architecture.md](../reference/architecture.md) and [MQTT_TOPICS.md](MQTT_TOPICS.md).

---

## Topics — `mapping:=true` (SLAM / mapping mode · 136 topics)

/bumper_stop
/camera/front/camera_info
/camera/front/image_raw
/camera/front/image_raw/compressed
/camera/front/image_raw/compressed/parameter_descriptions
/camera/front/image_raw/compressed/parameter_updates
/camera/front/image_raw/compressedDepth
/camera/front/image_raw/compressedDepth/parameter_descriptions
/camera/front/image_raw/compressedDepth/parameter_updates
/camera/front/image_raw/mouse_click
/camera/front/image_raw/theora
/camera/front/image_raw/theora/parameter_descriptions
/camera/front/image_raw/theora/parameter_updates
/camera/front/parameter_descriptions
/camera/front/parameter_updates
/clicked_point
/client_count
/clock
/cmd_vel_out
/connected_clients
/diagnostics
/diff_controller/cmd_vel
/diff_controller/odom
/diff_controller/odom/safe
/diff_controller/parameter_descriptions
/diff_controller/parameter_updates
/drive/left/ready
/drive/right/ready
/e_stop
/error_stop
/gazebo/link_states
/gazebo/model_states
/gazebo/parameter_descriptions
/gazebo/parameter_updates
/gazebo/performance_metrics
/gazebo/set_link_state
/gazebo/set_model_state
/gmapping_node/entropy
/imu/center/data
/imu/center/imu_in/mag
/imu/center/oriented
/imu/center/safe
/initialpose
/joint_states
/joy
/joy/set_feedback
/joy_teleop/cmd_vel
/keyboard_teleop/cmd_vel
/laser/obstacle/laser_filters/shadows/parameter_descriptions
/laser/obstacle/laser_filters/shadows/parameter_updates
/lidar/center/cloud
/lidar/center/obstacle_cloud_filtered
/lidar/center/obstacle_crop_box/parameter_descriptions
/lidar/center/obstacle_crop_box/parameter_updates
/lidar/center/obstacle_scan
/lidar/center/obstacle_scan_filtered
/lidar/center/obstacle_voxel_grid
/lidar/center/obstacle_voxel_grid/parameter_descriptions
/lidar/center/obstacle_voxel_grid/parameter_updates
/lidar/center/slam_cloud_filtered
/lidar/center/slam_crop_box/parameter_descriptions
/lidar/center/slam_crop_box/parameter_updates
/lidar/center/slam_scan_filtered
/lidar/center/slam_voxel_grid
/lidar/center/slam_voxel_grid/parameter_descriptions
/lidar/center/slam_voxel_grid/parameter_updates
/map_metadata
/move_base/cancel
/move_base/feedback
/move_base/goal
/move_base/recovery_status
/move_base/result
/move_base/status
/move_base_node/DWAPlannerROS/cost_cloud
/move_base_node/DWAPlannerROS/global_plan
/move_base_node/DWAPlannerROS/local_plan
/move_base_node/DWAPlannerROS/parameter_descriptions
/move_base_node/DWAPlannerROS/parameter_updates
/move_base_node/DWAPlannerROS/trajectory_cloud
/move_base_node/NavfnROS/plan
/move_base_node/current_goal
/move_base_node/global_costmap/costmap
/move_base_node/global_costmap/costmap_updates
/move_base_node/global_costmap/footprint
/move_base_node/global_costmap/inflation_layer/parameter_descriptions
/move_base_node/global_costmap/inflation_layer/parameter_updates
/move_base_node/global_costmap/map_layer/parameter_descriptions
/move_base_node/global_costmap/map_layer/parameter_updates
/move_base_node/global_costmap/parameter_descriptions
/move_base_node/global_costmap/parameter_updates
/move_base_node/local_costmap/costmap
/move_base_node/local_costmap/costmap_updates
/move_base_node/local_costmap/footprint
/move_base_node/local_costmap/inflation_layer/parameter_descriptions
/move_base_node/local_costmap/inflation_layer/parameter_updates
/move_base_node/local_costmap/map_layer/parameter_descriptions
/move_base_node/local_costmap/map_layer/parameter_updates
/move_base_node/local_costmap/obstacle_layer/parameter_descriptions
/move_base_node/local_costmap/obstacle_layer/parameter_updates
/move_base_node/local_costmap/parameter_descriptions
/move_base_node/local_costmap/parameter_updates
/move_base_node/parameter_descriptions
/move_base_node/parameter_updates
/move_base_simple/goal
/navigation/cmd_vel
/reference/map
/reference/map_updates
/robot_pose_ekf_node/odom_combined
/rosout
/rosout_agg
/rqt_teleop/cmd_vel
/rviz_node/compressed/parameter_descriptions
/rviz_node/compressed/parameter_updates
/safety/cloud_exist
/safety/cloud_obstacle
/safety/costmap/enable
/safety/enable
/safety/error
/safety/error/diff_controller/odom
/safety/error/imu/center/data
/safety/error/lidar/center/obstacle_cloud_filtered
/safety/error/lidar/center/slam_cloud_filtered
/safety/error_manager_node/parameter_descriptions
/safety/error_manager_node/parameter_updates
/safety/imuError
/safety/odomError
/safety/vertice
/tf
/tf_static
/utility/sound/robotsound
/utility/sound/sound_play/cancel
/utility/sound/sound_play/feedback
/utility/sound/sound_play/goal
/utility/sound/sound_play/result
/utility/sound/sound_play/status
/web_teleop/cmd_vel

---

## Topics — `mapping:=false` (localization + navigation mode · 143 topics)

/amcl_node/parameter_descriptions
/amcl_node/parameter_updates
/amcl_pose
/bumper_stop
/camera/front/camera_info
/camera/front/image_raw
/camera/front/image_raw/compressed
/camera/front/image_raw/compressed/parameter_descriptions
/camera/front/image_raw/compressed/parameter_updates
/camera/front/image_raw/compressedDepth
/camera/front/image_raw/compressedDepth/parameter_descriptions
/camera/front/image_raw/compressedDepth/parameter_updates
/camera/front/image_raw/mouse_click
/camera/front/image_raw/theora
/camera/front/image_raw/theora/parameter_descriptions
/camera/front/image_raw/theora/parameter_updates
/camera/front/parameter_descriptions
/camera/front/parameter_updates
/clicked_point
/client_count
/clock
/cmd_vel_out
/connected_clients
/diagnostics
/diff_controller/cmd_vel
/diff_controller/odom
/diff_controller/odom/safe
/diff_controller/parameter_descriptions
/diff_controller/parameter_updates
/drive/left/ready
/drive/right/ready
/e_stop
/error_stop
/gazebo/link_states
/gazebo/model_states
/gazebo/parameter_descriptions
/gazebo/parameter_updates
/gazebo/performance_metrics
/gazebo/set_link_state
/gazebo/set_model_state
/global/map
/global/map_metadata
/imu/center/data
/imu/center/imu_in/mag
/imu/center/oriented
/imu/center/safe
/initialpose
/joint_states
/joy
/joy/set_feedback
/joy_teleop/cmd_vel
/keyboard_teleop/cmd_vel
/laser/obstacle/laser_filters/shadows/parameter_descriptions
/laser/obstacle/laser_filters/shadows/parameter_updates
/lidar/center/cloud
/lidar/center/obstacle_cloud_filtered
/lidar/center/obstacle_crop_box/parameter_descriptions
/lidar/center/obstacle_crop_box/parameter_updates
/lidar/center/obstacle_scan
/lidar/center/obstacle_scan_filtered
/lidar/center/obstacle_voxel_grid
/lidar/center/obstacle_voxel_grid/parameter_descriptions
/lidar/center/obstacle_voxel_grid/parameter_updates
/lidar/center/slam_cloud_filtered
/lidar/center/slam_crop_box/parameter_descriptions
/lidar/center/slam_crop_box/parameter_updates
/lidar/center/slam_scan_filtered
/lidar/center/slam_voxel_grid
/lidar/center/slam_voxel_grid/parameter_descriptions
/lidar/center/slam_voxel_grid/parameter_updates
/local/map
/local/map_metadata
/move_base/cancel
/move_base/feedback
/move_base/goal
/move_base/recovery_status
/move_base/result
/move_base/status
/move_base_node/DWAPlannerROS/cost_cloud
/move_base_node/DWAPlannerROS/global_plan
/move_base_node/DWAPlannerROS/local_plan
/move_base_node/DWAPlannerROS/parameter_descriptions
/move_base_node/DWAPlannerROS/parameter_updates
/move_base_node/DWAPlannerROS/trajectory_cloud
/move_base_node/NavfnROS/plan
/move_base_node/current_goal
/move_base_node/global_costmap/costmap
/move_base_node/global_costmap/costmap_updates
/move_base_node/global_costmap/footprint
/move_base_node/global_costmap/inflation_layer/parameter_descriptions
/move_base_node/global_costmap/inflation_layer/parameter_updates
/move_base_node/global_costmap/map_layer/parameter_descriptions
/move_base_node/global_costmap/map_layer/parameter_updates
/move_base_node/global_costmap/parameter_descriptions
/move_base_node/global_costmap/parameter_updates
/move_base_node/local_costmap/costmap
/move_base_node/local_costmap/costmap_updates
/move_base_node/local_costmap/footprint
/move_base_node/local_costmap/inflation_layer/parameter_descriptions
/move_base_node/local_costmap/inflation_layer/parameter_updates
/move_base_node/local_costmap/map_layer/parameter_descriptions
/move_base_node/local_costmap/map_layer/parameter_updates
/move_base_node/local_costmap/obstacle_layer/parameter_descriptions
/move_base_node/local_costmap/obstacle_layer/parameter_updates
/move_base_node/local_costmap/parameter_descriptions
/move_base_node/local_costmap/parameter_updates
/move_base_node/parameter_descriptions
/move_base_node/parameter_updates
/move_base_simple/goal
/navigation/cmd_vel
/particlecloud
/reference/map
/reference/map_metadata
/reference/map_updates
/robot_pose_ekf_node/odom_combined
/rosout
/rosout_agg
/rqt_teleop/cmd_vel
/rviz_node/compressed/parameter_descriptions
/rviz_node/compressed/parameter_updates
/safety/cloud_exist
/safety/cloud_obstacle
/safety/costmap/enable
/safety/enable
/safety/error
/safety/error/diff_controller/odom
/safety/error/imu/center/data
/safety/error/lidar/center/obstacle_cloud_filtered
/safety/error/lidar/center/slam_cloud_filtered
/safety/error_manager_node/parameter_descriptions
/safety/error_manager_node/parameter_updates
/safety/imuError
/safety/odomError
/safety/vertice
/tf
/tf_static
/utility/sound/robotsound
/utility/sound/sound_play/cancel
/utility/sound/sound_play/feedback
/utility/sound/sound_play/goal
/utility/sound/sound_play/result
/utility/sound/sound_play/status
/web_teleop/cmd_vel
