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

import { useState, useMemo } from 'react';
import {
  RELATION_PROVIDES_API,
  RELATION_CONSUMES_API,
} from '@backstage/catalog-model';
import { useEntity, useRelatedEntities } from '@backstage/plugin-catalog-react';
import Accordion from '@material-ui/core/Accordion';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import Typography from '@material-ui/core/Typography';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import Chip from '@material-ui/core/Chip';
import Box from '@material-ui/core/Box';
import CircularProgress from '@material-ui/core/CircularProgress';
import { makeStyles } from '@material-ui/core/styles';
import type { Entity } from '@backstage/catalog-model';

const useStyles = makeStyles(theme => ({
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionHeader: {
    fontWeight: 600,
    fontSize: '1.1rem',
    marginBottom: theme.spacing(1),
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  routeAccordion: {
    '&:before': {
      display: 'none',
    },
    boxShadow: 'none',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '4px !important',
    marginBottom: theme.spacing(1),
  },
  routeSummary: {
    fontWeight: 500,
    fontFamily: 'monospace',
    fontSize: '0.95rem',
  },
  endpointRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.75, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  methodChip: {
    fontWeight: 700,
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    minWidth: 60,
    justifyContent: 'center',
  },
  get: { backgroundColor: '#61affe', color: '#fff' },
  post: { backgroundColor: '#49cc90', color: '#fff' },
  put: { backgroundColor: '#fca130', color: '#fff' },
  delete: { backgroundColor: '#f93e3e', color: '#fff' },
  patch: { backgroundColor: '#50e3c2', color: '#fff' },
  default: { backgroundColor: theme.palette.grey[500], color: '#fff' },
  pathText: {
    fontFamily: 'monospace',
    fontSize: '0.9rem',
  },
  summary: {
    color: theme.palette.text.secondary,
    fontSize: '0.85rem',
    marginLeft: theme.spacing(1),
  },
  emptyState: {
    padding: theme.spacing(3),
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
  badge: {
    marginLeft: theme.spacing(1),
    fontSize: '0.75rem',
  },
}));

interface RouteGroup {
  prefix: string;
  endpoints: Array<{
    method: string;
    path: string;
    summary?: string;
    operationId?: string;
  }>;
}

function parseOpenApiRoutes(definition: string): RouteGroup[] {
  try {
    const spec = JSON.parse(definition);
    const paths = spec.paths ?? {};

    const groupMap = new Map<string, RouteGroup['endpoints']>();

    for (const [path, methods] of Object.entries<Record<string, any>>(paths)) {
      // Extract parent route: first two path segments (e.g., /v1/health)
      const segments = path.split('/').filter(Boolean);
      const prefix =
        segments.length >= 2
          ? `/${segments[0]}/${segments[1]}`
          : `/${segments[0] ?? ''}`;

      if (!groupMap.has(prefix)) {
        groupMap.set(prefix, []);
      }

      for (const [method, details] of Object.entries<any>(methods)) {
        if (
          ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(
            method.toLowerCase(),
          )
        ) {
          groupMap.get(prefix)!.push({
            method: method.toUpperCase(),
            path,
            summary: details?.summary,
            operationId: details?.operationId,
          });
        }
      }
    }

    return Array.from(groupMap.entries())
      .map(([prefix, endpoints]) => ({ prefix, endpoints }))
      .sort((a, b) => a.prefix.localeCompare(b.prefix));
  } catch {
    return [];
  }
}

function ApiSection({
  title,
  entities,
  loading,
}: {
  title: string;
  entities: Entity[] | undefined;
  loading: boolean;
}) {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(true);

  const routeGroups = useMemo(() => {
    if (!entities) return [];
    const allGroups: RouteGroup[] = [];
    for (const entity of entities) {
      const definition = (entity.spec as any)?.definition;
      if (typeof definition === 'string') {
        allGroups.push(...parseOpenApiRoutes(definition));
      }
    }
    // Merge groups with same prefix
    const merged = new Map<string, RouteGroup['endpoints']>();
    for (const group of allGroups) {
      const existing = merged.get(group.prefix) ?? [];
      merged.set(group.prefix, [...existing, ...group.endpoints]);
    }
    return Array.from(merged.entries())
      .map(([prefix, endpoints]) => ({ prefix, endpoints }))
      .sort((a, b) => a.prefix.localeCompare(b.prefix));
  }, [entities]);

  if (loading) {
    return (
      <Box className={classes.section}>
        <Typography className={classes.sectionHeader}>{title}</Typography>
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress size={24} />
        </Box>
      </Box>
    );
  }

  return (
    <Box className={classes.section}>
      <Accordion
        expanded={expanded}
        onChange={() => setExpanded(!expanded)}
        style={{ boxShadow: 'none', background: 'transparent' }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography className={classes.sectionHeader}>
            {title}
            <Chip
              label={`${routeGroups.length} route groups`}
              size="small"
              className={classes.badge}
            />
          </Typography>
        </AccordionSummary>
        <AccordionDetails style={{ display: 'block', padding: 0 }}>
          {routeGroups.length === 0 ? (
            <Typography className={classes.emptyState}>
              No APIs found
            </Typography>
          ) : (
            routeGroups.map(group => (
              <RouteGroupAccordion key={group.prefix} group={group} />
            ))
          )}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}

function RouteGroupAccordion({ group }: { group: RouteGroup }) {
  const classes = useStyles();

  const methodColorClass = (method: string): string => {
    const m = method.toLowerCase();
    if (m in classes) return (classes as any)[m];
    return classes.default;
  };

  return (
    <Accordion className={classes.routeAccordion} TransitionProps={{ unmountOnExit: true }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography className={classes.routeSummary}>
          {group.prefix}
        </Typography>
        <Chip
          label={`${group.endpoints.length} endpoints`}
          size="small"
          className={classes.badge}
        />
      </AccordionSummary>
      <AccordionDetails style={{ display: 'block', paddingTop: 0 }}>
        {group.endpoints.map((ep, i) => (
          <Box key={`${ep.method}-${ep.path}-${i}`} className={classes.endpointRow}>
            <Chip
              label={ep.method}
              size="small"
              className={`${classes.methodChip} ${methodColorClass(ep.method)}`}
            />
            <Typography className={classes.pathText}>{ep.path}</Typography>
            {ep.summary && (
              <Typography className={classes.summary}>{ep.summary}</Typography>
            )}
          </Box>
        ))}
      </AccordionDetails>
    </Accordion>
  );
}

export function CollapsibleApiContent() {
  const { entity } = useEntity();

  const {
    entities: providedApis,
    loading: loadingProvided,
  } = useRelatedEntities(entity, {
    type: RELATION_PROVIDES_API,
  });

  const {
    entities: consumedApis,
    loading: loadingConsumed,
  } = useRelatedEntities(entity, {
    type: RELATION_CONSUMES_API,
  });

  return (
    <Box>
      <ApiSection
        title="Produced APIs"
        entities={providedApis}
        loading={loadingProvided}
      />
      <ApiSection
        title="Consumed APIs"
        entities={consumedApis}
        loading={loadingConsumed}
      />
    </Box>
  );
}
