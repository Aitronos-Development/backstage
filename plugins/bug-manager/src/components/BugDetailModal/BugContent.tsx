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

import { useState } from 'react';
import Box from '@material-ui/core/Box';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import { MarkdownContent } from '@backstage/core-components';
import { Bug, UpdateBugRequest } from '../../api/types';
import { MarkdownEditor } from '../shared/MarkdownEditor';
import { CommentSection } from './CommentSection';

const useStyles = makeStyles(theme => ({
  editableText: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
      borderRadius: theme.shape.borderRadius,
    },
    padding: theme.spacing(0.5),
  },
  descriptionDisplay: {
    cursor: 'pointer',
    padding: theme.spacing(0.5),
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
      borderRadius: theme.shape.borderRadius,
    },
  },
  placeholder: {
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
    padding: theme.spacing(0.5),
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
      borderRadius: theme.shape.borderRadius,
    },
  },
  sectionDivider: {
    marginTop: theme.spacing(3),
    marginBottom: theme.spacing(1),
  },
}));

interface BugContentProps {
  bug: Bug;
  onUpdate: (updates: UpdateBugRequest) => void;
}

export const BugContent = ({ bug, onUpdate }: BugContentProps) => {
  const classes = useStyles();

  // Heading inline edit state
  const [isEditingHeading, setIsEditingHeading] = useState(false);
  const [headingValue, setHeadingValue] = useState(bug.heading);
  const [headingError, setHeadingError] = useState(false);

  // Description inline edit state
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(bug.description);

  const handleHeadingSave = () => {
    const trimmed = headingValue.trim();
    if (!trimmed) {
      setHeadingError(true);
      return;
    }
    setHeadingError(false);
    setIsEditingHeading(false);
    if (trimmed !== bug.heading) {
      onUpdate({ heading: trimmed });
    }
  };

  const handleDescriptionSave = () => {
    setIsEditingDescription(false);
    if (descriptionValue !== bug.description) {
      onUpdate({ description: descriptionValue });
    }
  };

  return (
    <Box>
      {/* Heading */}
      {!isEditingHeading ? (
        <Typography
          variant="h5"
          onClick={() => {
            setHeadingValue(bug.heading);
            setIsEditingHeading(true);
          }}
          className={classes.editableText}
        >
          {bug.heading}
        </Typography>
      ) : (
        <TextField
          fullWidth
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={headingValue}
          onChange={e => {
            setHeadingValue(e.target.value);
            if (headingError && e.target.value.trim()) setHeadingError(false);
          }}
          onBlur={handleHeadingSave}
          onKeyDown={e => {
            if (e.key === 'Enter') handleHeadingSave();
            if (e.key === 'Escape') {
              setHeadingValue(bug.heading);
              setHeadingError(false);
              setIsEditingHeading(false);
            }
          }}
          variant="outlined"
          inputProps={{ maxLength: 200 }}
          error={headingError}
          helperText={headingError ? 'Heading cannot be empty' : undefined}
        />
      )}

      {/* Description */}
      <Box className={classes.sectionDivider}>
        <Typography variant="subtitle2" color="textSecondary" gutterBottom>
          Description
        </Typography>
        {!isEditingDescription ? (
          bug.description ? (
            <Box
              onClick={() => {
                setDescriptionValue(bug.description);
                setIsEditingDescription(true);
              }}
              className={classes.descriptionDisplay}
            >
              <MarkdownContent content={bug.description} />
            </Box>
          ) : (
            <Typography
              variant="body1"
              onClick={() => {
                setDescriptionValue(bug.description);
                setIsEditingDescription(true);
              }}
              className={classes.placeholder}
            >
              Add a description...
            </Typography>
          )
        ) : (
          <MarkdownEditor
            value={descriptionValue}
            onChange={setDescriptionValue}
            minRows={4}
            maxRows={12}
            autoFocus
            onBlur={handleDescriptionSave}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setDescriptionValue(bug.description);
                setIsEditingDescription(false);
              }
            }}
            placeholder="Add a description..."
          />
        )}
      </Box>

      {/* Comments */}
      <CommentSection bugId={bug.id} />
    </Box>
  );
};
