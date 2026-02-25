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

import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@material-ui/core/Box';
import IconButton from '@material-ui/core/IconButton';
import Skeleton from '@material-ui/lab/Skeleton';
import Snackbar from '@material-ui/core/Snackbar';
import { makeStyles } from '@material-ui/core/styles';
import CloseIcon from '@material-ui/icons/Close';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useBugManagerContext } from '../../context/useBugManagerContext';
import { Bug } from '../../api/types';
import { BoardColumn } from './BoardColumn';

const useStyles = makeStyles(theme => ({
  board: {
    display: 'flex',
    gap: theme.spacing(2),
    overflowX: 'auto',
    padding: theme.spacing(2, 0),
    minHeight: 400,
  },
}));

export const BoardView = () => {
  const classes = useStyles();
  const { bugs, statuses, updateBug, selectBug, loading, invalidate } = useBugManagerContext();

  const [localBugs, setLocalBugs] = useState<Bug[]>(bugs);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const dragInFlightRef = useRef(false);

  // Keep localBugs in sync with authoritative bugs from context,
  // but only when no drag is in flight (to avoid flickering during the gesture)
  useEffect(() => {
    if (!dragInFlightRef.current) {
      setLocalBugs(bugs);
    }
  }, [bugs]);

  const sortedStatuses = useMemo(
    () => statuses.slice().sort((a, b) => a.order - b.order),
    [statuses],
  );

  const bugsByStatus = useMemo(() => {
    const grouped = new Map<string, Bug[]>();

    sortedStatuses.forEach(status => grouped.set(status.id, []));

    localBugs.forEach(bug => {
      const group = grouped.get(bug.status.id);
      if (group) group.push(bug);
    });

    grouped.forEach(bugList =>
      bugList.sort((a, b) => b.ticketNumber.localeCompare(a.ticketNumber)),
    );

    return grouped;
  }, [localBugs, sortedStatuses]);

  const handleDragStart = () => {
    dragInFlightRef.current = true;
  };

  const handleDragEnd = async (result: DropResult) => {
    dragInFlightRef.current = false;

    if (!result.destination) return;
    if (result.destination.droppableId === result.source.droppableId) return;

    const { draggableId, destination } = result;
    const newStatusId = destination.droppableId;

    // Find the bug and its original status for potential rollback
    const originalBug = localBugs.find(b => b.id === draggableId);
    const originalStatus = originalBug?.status.id;

    // Optimistic update — move the card in local state immediately
    setLocalBugs(prev =>
      prev.map(b => {
        if (b.id !== draggableId) return b;
        const newStatus = statuses.find(s => s.id === newStatusId) ?? b.status;
        return { ...b, status: newStatus };
      }),
    );

    // Fire the PATCH in the background
    try {
      await updateBug(draggableId, { statusId: newStatusId });
      // updateBug calls invalidate() → useAsync re-fetches → localBugs syncs with server
    } catch {
      // Rollback on failure
      setLocalBugs(prev =>
        prev.map(b => {
          if (b.id !== draggableId || !originalStatus) return b;
          const originalStatusObj = statuses.find(s => s.id === originalStatus) ?? b.status;
          return { ...b, status: originalStatusObj };
        }),
      );
      setSnackbar('Failed to move card — please try again.');
      invalidate();
    }
  };

  if (loading) {
    return (
      <Box display="flex" style={{ gap: 16, padding: 16 }}>
        {sortedStatuses.map(s => (
          <Box key={s.id} flex={1}>
            <Skeleton variant="rect" height={40} style={{ marginBottom: 8 }} />
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} variant="rect" height={100} style={{ marginBottom: 8 }} />
            ))}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <>
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <Box className={classes.board}>
          {sortedStatuses.map(status => (
            <BoardColumn
              key={status.id}
              status={status}
              bugs={bugsByStatus.get(status.id) || []}
              onCardClick={selectBug}
            />
          ))}
        </Box>
      </DragDropContext>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
        action={
          <IconButton size="small" color="inherit" onClick={() => setSnackbar(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />
    </>
  );
};
