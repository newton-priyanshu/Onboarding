interface NotificationItem {
  id: string;
  user_id: string;
  from_user_id: string | null;
  worksheet_id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

interface NotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useNotifications(user: object | null, pollInterval?: number): NotificationsResult;

export function triggerNotification(opts: {
  userId: string;
  fromUserId?: string;
  worksheetId: string;
  type: string;
  message: string;
}): Promise<void>;

export function getReviewerUserIds(reviewerType: string): Promise<string[]>;

export function getAssignedReviewerIds(joineeUserId: string, reviewerType: string): Promise<string[]>;
