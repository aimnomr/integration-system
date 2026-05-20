/**
 * Minimal TypeScript views of the ROS messages the UI subscribes to or
 * publishes. Full ROS message definitions are vast; we only type what we
 * actually read.
 */

export interface Point     { x: number; y: number; z: number; }
export interface Quaternion { x: number; y: number; z: number; w: number; }

export interface Header {
  seq?: number;
  stamp: { secs: number; nsecs: number };
  frame_id: string;
}

export interface Pose {
  position: Point;
  orientation: Quaternion;
}

export interface PoseWithCovariance {
  pose: Pose;
  covariance?: number[];
}

export interface PoseWithCovarianceStamped {
  header: Header;
  pose: PoseWithCovariance;
}

export interface PoseStamped {
  header: Header;
  pose: Pose;
}

export interface Path {
  header: Header;
  poses: PoseStamped[];
}

export interface MapMetaData {
  resolution: number;            // meters per cell
  width: number;                 // cells
  height: number;                // cells
  origin: Pose;                  // pose of cell (0,0) in the world frame
}

export interface OccupancyGrid {
  header: Header;
  info: MapMetaData;
  data: number[];                // -1 unknown, 0 free, 1..100 occupied
}

export interface CompressedImage {
  header: Header;
  format: string;                // 'jpeg' / 'png'
  data: string;                  // base64 (rosbridge converts the raw bytes)
}

export interface Twist {
  linear:  { x: number; y: number; z: number };
  angular: { x: number; y: number; z: number };
}
