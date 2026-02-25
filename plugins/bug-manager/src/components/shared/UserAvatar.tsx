/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Avatar from '@material-ui/core/Avatar';
import Typography from '@material-ui/core/Typography';
import Box from '@material-ui/core/Box';
import { User } from '../../api/types';

interface UserAvatarProps {
  user: User | null;
  showName?: boolean;
}

export const UserAvatar = ({ user, showName = true }: UserAvatarProps) => {
  if (!user) {
    return (
      <Typography variant="body2" color="textSecondary">
        Unassigned
      </Typography>
    );
  }

  const initials = user.displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase();

  return (
    <Box display="flex" alignItems="center" style={{ gap: 8 }}>
      <Avatar
        src={user.avatarUrl}
        style={{ width: 28, height: 28, fontSize: 12 }}
      >
        {initials}
      </Avatar>
      {showName && (
        <Typography variant="body2">{user.displayName}</Typography>
      )}
    </Box>
  );
};
