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

import { useEffect, useState, useCallback } from 'react';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import CardHeader from '@material-ui/core/CardHeader';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Typography from '@material-ui/core/Typography';
import CircularProgress from '@material-ui/core/CircularProgress';
import { makeStyles } from '@material-ui/core/styles';
import { useApi, configApiRef } from '@backstage/core-plugin-api';

const useStyles = makeStyles(theme => ({
  up: {
    color: '#1DB954',
    fontWeight: 600,
  },
  down: {
    color: '#BA1A1A',
    fontWeight: 600,
  },
  light: {
    display: 'inline-block',
    width: 14,
    height: 14,
    borderRadius: '50%',
    marginRight: 10,
    verticalAlign: 'middle',
    boxShadow: '0 0 6px 1px currentColor',
  },
  lightUp: {
    backgroundColor: '#1DB954',
    color: '#1DB954',
  },
  lightDown: {
    backgroundColor: '#BA1A1A',
    color: '#BA1A1A',
  },
  overallBanner: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(1.5, 2),
    borderRadius: 6,
    marginBottom: theme.spacing(2),
  },
  bannerUp: {
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
    border: '1px solid rgba(29, 185, 84, 0.3)',
  },
  bannerDown: {
    backgroundColor: 'rgba(186, 26, 26, 0.1)',
    border: '1px solid rgba(186, 26, 26, 0.3)',
  },
  componentRow: {
    '&:last-child td': {
      borderBottom: 0,
    },
  },
  statusCell: {
    display: 'flex',
    alignItems: 'center',
  },
}));

interface HealthComponent {
  name: string;
  status: string;
  details?: string;
}

interface HealthResponse {
  status: string;
  components: HealthComponent[];
}

function isUp(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'healthy' || s === 'ok';
}

function formatName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function HealthCheckCard() {
  const classes = useStyles();
  const config = useApi(configApiRef);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = config.getString('backend.baseUrl');

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch(
        `${backendUrl}/api/proxy/freddy-health/v1/health/details`,
      );
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const data = await response.json();
      setHealth(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch health');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (loading) {
    return (
      <Card>
        <CardHeader title="Health" />
        <CardContent
          style={{ display: 'flex', justifyContent: 'center', padding: 32 }}
        >
          <CircularProgress />
        </CardContent>
      </Card>
    );
  }

  if (error || !health) {
    return (
      <Card>
        <CardHeader title="Health" />
        <CardContent>
          <div className={`${classes.overallBanner} ${classes.bannerDown}`}>
            <span className={`${classes.light} ${classes.lightDown}`} />
            <Typography className={classes.down}>
              Down — {error ?? 'Service unreachable'}
            </Typography>
          </div>
        </CardContent>
      </Card>
    );
  }

  const overall = isUp(health.status);

  return (
    <Card>
      <CardHeader title="Health" />
      <CardContent>
        <div
          className={`${classes.overallBanner} ${overall ? classes.bannerUp : classes.bannerDown}`}
        >
          <span
            className={`${classes.light} ${overall ? classes.lightUp : classes.lightDown}`}
          />
          <Typography className={overall ? classes.up : classes.down}>
            {overall ? 'Up — Service is healthy' : 'Down — Service is unhealthy'}
          </Typography>
        </div>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Component</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {health.components.map(component => {
              const componentUp = isUp(component.status);
              return (
                <TableRow key={component.name} className={classes.componentRow}>
                  <TableCell>{formatName(component.name)}</TableCell>
                  <TableCell>
                    <div className={classes.statusCell}>
                      <span
                        className={`${classes.light} ${componentUp ? classes.lightUp : classes.lightDown}`}
                      />
                      <span className={componentUp ? classes.up : classes.down}>
                        {componentUp ? 'Up' : 'Down'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="textSecondary">
                      {component.details ?? '-'}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
