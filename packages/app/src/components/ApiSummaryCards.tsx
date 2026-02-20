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

import {
  RELATION_PROVIDES_API,
  RELATION_CONSUMES_API,
} from '@backstage/catalog-model';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import CardHeader from '@material-ui/core/CardHeader';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import CircularProgress from '@material-ui/core/CircularProgress';
import { makeStyles } from '@material-ui/core/styles';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import {
  useEntity,
  useRelatedEntities,
  entityRouteRef,
} from '@backstage/plugin-catalog-react';
import { useRouteRef } from '@backstage/core-plugin-api';

const useStyles = makeStyles(theme => ({
  listItem: {
    cursor: 'pointer',
    borderRadius: 6,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  arrow: {
    color: theme.palette.text.secondary,
    marginLeft: 'auto',
  },
  apiName: {
    fontWeight: 500,
  },
}));

function ApiListCard({
  title,
  relationType,
}: {
  title: string;
  relationType: string;
}) {
  const classes = useStyles();
  const { entity } = useEntity();
  const { entities, loading, error } = useRelatedEntities(entity, {
    type: relationType,
  });
  const entityRoute = useRouteRef(entityRouteRef);

  if (loading) {
    return (
      <Card>
        <CardHeader title={title} />
        <CardContent
          style={{ display: 'flex', justifyContent: 'center', padding: 32 }}
        >
          <CircularProgress />
        </CardContent>
      </Card>
    );
  }

  if (error || !entities) {
    return (
      <Card>
        <CardHeader title={title} />
        <CardContent>
          <Typography color="error">
            Failed to load APIs
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (entities.length === 0) {
    return (
      <Card>
        <CardHeader title={title} />
        <CardContent>
          <Typography variant="body2" color="textSecondary">
            No APIs found
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={title} />
      <CardContent style={{ paddingTop: 0 }}>
        <List disablePadding>
          {entities.map(api => {
            const baseHref = entityRoute({
              kind: api.kind,
              namespace: api.metadata.namespace || 'default',
              name: api.metadata.name,
            });
            const href = `${baseHref}/definition`;
            return (
              <ListItem
                key={api.metadata.name}
                className={classes.listItem}
                component="a"
                href={href}
                disableGutters
              >
                <ListItemText
                  primary={
                    <span className={classes.apiName}>
                      {api.metadata.title || api.metadata.name}
                    </span>
                  }
                  secondary={api.metadata.description}
                />
                <ArrowForwardIcon className={classes.arrow} fontSize="small" />
              </ListItem>
            );
          })}
        </List>
      </CardContent>
    </Card>
  );
}

export function ProvidedApisSummaryCard() {
  return (
    <ApiListCard title="Provided APIs" relationType={RELATION_PROVIDES_API} />
  );
}

export function ConsumedApisSummaryCard() {
  return (
    <ApiListCard title="Consumed APIs" relationType={RELATION_CONSUMES_API} />
  );
}
