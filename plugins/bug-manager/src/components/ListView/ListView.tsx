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

import { useMemo, useState } from 'react';
import Box from '@material-ui/core/Box';
import Skeleton from '@material-ui/lab/Skeleton';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import TableSortLabel from '@material-ui/core/TableSortLabel';
import Typography from '@material-ui/core/Typography';
import { useTheme } from '@material-ui/core/styles';
import BugReportIcon from '@material-ui/icons/BugReport';
import { useBugManagerContext } from '../../context/useBugManagerContext';
import { Bug } from '../../api/types';
import { PRIORITY_ORDER } from '../../utils/priorities';
import { BugRow } from './BugRow';

type SortKey =
  | 'ticketNumber'
  | 'heading'
  | 'assignee'
  | 'status'
  | 'priority';
type SortDirection = 'asc' | 'desc';

function compareBugs(a: Bug, b: Bug, key: SortKey): number {
  switch (key) {
    case 'ticketNumber':
      return a.ticketNumber.localeCompare(b.ticketNumber);
    case 'heading':
      return a.heading.localeCompare(b.heading);
    case 'assignee': {
      const aName = a.assignee?.displayName || '\uffff';
      const bName = b.assignee?.displayName || '\uffff';
      return aName.localeCompare(bName);
    }
    case 'status':
      return a.status.order - b.status.order;
    case 'priority':
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    default:
      return 0;
  }
}

function getEmptyStateMessage(hasFilters: boolean, closed: boolean): string {
  if (hasFilters) {
    return closed ? 'No bugs match these filters' : 'Try adjusting your filters';
  }
  return closed ? 'No bugs found' : 'No active bugs. Use "Include closed" to view closed tickets.';
}

const COLUMNS: { key: SortKey; label: string; width?: number | string }[] = [
  { key: 'ticketNumber', label: 'Ticket #', width: 120 },
  { key: 'heading', label: 'Heading' },
  { key: 'assignee', label: 'Assignee', width: 180 },
  { key: 'status', label: 'Status', width: 140 },
  { key: 'priority', label: 'Priority', width: 120 },
];

export const ListView = () => {
  const theme = useTheme();
  const { bugs, filters, selectBug, includeClosed, loading } = useBugManagerContext();
  const [sortKey, setSortKey] = useState<SortKey>('ticketNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedBugs = useMemo(() => {
    const sorted = [...bugs].sort((a, b) => compareBugs(a, b, sortKey));
    return sortDirection === 'desc' ? sorted.reverse() : sorted;
  }, [bugs, sortKey, sortDirection]);

  const hasActiveFilters = !!(
    filters.status ||
    filters.priority ||
    filters.search
  );

  if (loading) {
    return (
      <Box px={2}>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} variant="rect" height={48} style={{ marginBottom: 8 }} />
        ))}
      </Box>
    );
  }

  if (bugs.length === 0) {
    return (
      <Box textAlign="center" py={8}>
        <BugReportIcon
          style={{ fontSize: 64, color: theme.palette.text.disabled }}
        />
        <Typography variant="h6" color="textSecondary">
          No bugs found
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {getEmptyStateMessage(hasActiveFilters, includeClosed)}
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            {COLUMNS.map(col => (
              <TableCell key={col.key} style={{ width: col.width }}>
                <TableSortLabel
                  active={sortKey === col.key}
                  direction={sortKey === col.key ? sortDirection : 'asc'}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedBugs.map(bug => (
            <BugRow key={bug.id} bug={bug} onClick={selectBug} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
