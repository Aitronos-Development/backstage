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

import Paper from '@material-ui/core/Paper';
import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import { Draggable } from '@hello-pangea/dnd';
import { Bug } from '../../api/types';
import { PRIORITY_COLORS } from '../../utils/priorities';
import { PriorityChip } from '../shared/PriorityChip';
import { UserAvatar } from '../shared/UserAvatar';

const useStyles = makeStyles(theme => ({
  card: {
    marginBottom: theme.spacing(1),
    padding: theme.spacing(1.5),
    cursor: 'pointer',
    '&:hover': {
      boxShadow: theme.shadows[3],
    },
  },
  dragging: {
    boxShadow: theme.shadows[8],
    transform: 'rotate(2deg)',
  },
  ticketNumber: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },
  heading: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontSize: '0.875rem',
    fontWeight: 500,
    margin: theme.spacing(0.5, 0),
  },
  bottomRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing(1),
  },
}));

interface BugCardProps {
  bug: Bug;
  index: number;
  onClick: () => void;
}

export const BugCard = ({ bug, index, onClick }: BugCardProps) => {
  const classes = useStyles();
  const borderColor = PRIORITY_COLORS[bug.priority];

  return (
    <Draggable draggableId={bug.id} index={index}>
      {(provided, snapshot) => (
        <Paper
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`${classes.card} ${snapshot.isDragging ? classes.dragging : ''}`}
          style={{
            borderLeft: `4px solid ${borderColor}`,
            opacity: bug.isClosed ? 0.5 : 1,
            position: 'relative',
            ...provided.draggableProps.style,
          }}
          onClick={onClick}
        >
          {bug.isClosed && (
            <Box position="absolute" top={4} right={4}>
              <Chip
                label="Closed"
                size="small"
                style={{ backgroundColor: '#9E9E9E', color: '#fff', fontSize: 10 }}
              />
            </Box>
          )}
          <Typography className={classes.ticketNumber}>
            {bug.ticketNumber}
          </Typography>
          <Typography className={classes.heading}>{bug.heading}</Typography>
          <Box className={classes.bottomRow}>
            <PriorityChip priority={bug.priority} />
            <UserAvatar user={bug.assignee} showName={false} />
          </Box>
        </Paper>
      )}
    </Draggable>
  );
};
