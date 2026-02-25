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

import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import { Droppable } from '@hello-pangea/dnd';
import { Bug, Status } from '../../api/types';
import { BugCard } from './BugCard';

const useStyles = makeStyles(theme => ({
  column: {
    flex: '1 1 0',
    minWidth: 240,
    maxWidth: 300,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#F5F5F5',
    borderRadius: theme.shape.borderRadius,
    position: 'relative',
    overflow: 'hidden',
  },
  colorBar: {
    width: '100%',
    height: 3,
  },
  columnHeader: {
    padding: theme.spacing(1.5, 2),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  cardList: {
    padding: theme.spacing(1),
    flex: 1,
    overflowY: 'auto',
    minHeight: 100,
  },
  cardListDragOver: {
    backgroundColor: theme.palette.action.hover,
  },
  emptyColumn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
    border: '1px dashed',
    borderColor: theme.palette.divider,
    borderRadius: theme.shape.borderRadius,
    margin: theme.spacing(1),
  },
}));

interface BoardColumnProps {
  status: Status;
  bugs: Bug[];
  onCardClick: (bugId: string) => void;
}

export const BoardColumn = ({ status, bugs, onCardClick }: BoardColumnProps) => {
  const classes = useStyles();

  return (
    <Paper className={classes.column} elevation={0}>
      <Box
        className={classes.colorBar}
        style={{ backgroundColor: status.color || '#9E9E9E' }}
      />
      <Box className={classes.columnHeader}>
        <Typography variant="subtitle2">{status.name}</Typography>
        <Chip label={bugs.length} size="small" />
      </Box>
      <Droppable droppableId={status.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`${classes.cardList} ${snapshot.isDraggingOver ? classes.cardListDragOver : ''}`}
          >
            {bugs.length === 0 && !snapshot.isDraggingOver && (
              <Box className={classes.emptyColumn}>
                <Typography variant="body2" color="textSecondary">
                  No bugs
                </Typography>
              </Box>
            )}
            {bugs.map((bug, index) => (
              <BugCard
                key={bug.id}
                bug={bug}
                index={index}
                onClick={() => onCardClick(bug.id)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </Paper>
  );
};
