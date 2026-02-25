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

import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { Bug } from '../../api/types';
import { PRIORITY_COLORS } from '../../utils/priorities';
import { PriorityChip } from '../shared/PriorityChip';
import { StatusChip } from '../shared/StatusChip';
import { UserAvatar } from '../shared/UserAvatar';

const useStyles = makeStyles(theme => ({
  row: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  closedRow: {
    opacity: 0.5,
  },
  ticketNumber: {
    fontFamily: 'monospace',
    fontWeight: 500,
  },
  closedTicketNumber: {
    textDecoration: 'line-through',
    color: theme.palette.text.disabled,
  },
  heading: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 400,
  },
}));

interface BugRowProps {
  bug: Bug;
  onClick: (bugId: string) => void;
}

export const BugRow = ({ bug, onClick }: BugRowProps) => {
  const classes = useStyles();
  const borderColor = PRIORITY_COLORS[bug.priority];

  return (
    <TableRow
      className={clsx(classes.row, bug.isClosed && classes.closedRow)}
      onClick={() => onClick(bug.id)}
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <TableCell className={clsx(classes.ticketNumber, bug.isClosed && classes.closedTicketNumber)}>
        {bug.ticketNumber}
      </TableCell>
      <TableCell className={classes.heading}>{bug.heading}</TableCell>
      <TableCell>
        <UserAvatar user={bug.assignee} />
      </TableCell>
      <TableCell>
        <StatusChip status={bug.status} />
      </TableCell>
      <TableCell>
        <PriorityChip priority={bug.priority} />
      </TableCell>
    </TableRow>
  );
};
