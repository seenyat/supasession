import React from 'react';
import dayjs from 'dayjs';
import styles from '../../css/app.module.scss';

// Define the props for the UserCard component
type UserCardProps = {
  user: {
    user_id: string;
    display_name: string;
    joined_timestamp: number;
  };
};

// Define the UserCard component
function UserCard({ user }: UserCardProps) {
  return (
    <div className={styles.user_card} key={user.user_id}>
      <span className={styles.username}>
        {user.display_name}
        {(user.display_name as string).toLowerCase().includes('alex') &&
          ' С др!'}
      </span>
      <span className={styles.seconds}>
        {user && dayjs(+user.joined_timestamp).fromNow()}
      </span>
    </div>
  );
}

export default UserCard;
