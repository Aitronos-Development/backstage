/*
 * Copyright 2022 The Backstage Authors
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

import { lighten, ThemeOptions } from '@mui/material/styles';

/**
 * A helper for creating theme overrides.
 *
 * @public
 */
export const defaultComponentThemes: ThemeOptions['components'] = {
  MuiCssBaseline: {
    styleOverrides: theme => ({
      html: {
        height: '100%',
        fontFamily: theme.typography.fontFamily,
      },
      body: {
        height: '100%',
        fontFamily: theme.typography.fontFamily,
        overscrollBehaviorY: 'none',
        fontSize: '0.875rem',
        lineHeight: 1.5,
        transition: 'background-color 300ms ease, color 200ms ease',
        '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
          backgroundColor: 'transparent',
          width: '6px',
        },
        '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
          borderRadius: 9999,
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.12)'
              : 'rgba(124, 58, 237, 0.15)',
        },
        '&::-webkit-scrollbar-thumb:active, & *::-webkit-scrollbar-thumb:active':
          {
            backgroundColor:
              theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.25)'
                : 'rgba(124, 58, 237, 0.3)',
          },
        '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover':
          {
            backgroundColor:
              theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.20)'
                : 'rgba(124, 58, 237, 0.25)',
          },
      },
      a: {
        color: 'inherit',
        textDecoration: 'none',
      },
    }),
  },
  MuiGrid: {
    defaultProps: {
      spacing: 2,
    },
  },
  MuiSwitch: {
    defaultProps: {
      color: 'primary',
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: ({ theme }) => ({
        '&:nth-of-type(odd)': {
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.02)'
              : 'rgba(124, 58, 237, 0.015)',
        },
        transition: 'background-color 200ms ease',
        '&:hover': {
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.04)'
              : 'rgba(124, 58, 237, 0.04)',
        },
      }),
      hover: {
        '&:hover': {
          cursor: 'pointer',
        },
      },
      head: ({ theme }) => ({
        '&:nth-of-type(odd)': {
          backgroundColor: theme.palette.background.paper,
        },
        '&:hover': {
          backgroundColor: theme.palette.background.paper,
        },
      }),
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: ({ theme }) => ({
        wordBreak: 'break-word',
        overflow: 'hidden',
        verticalAlign: 'middle',
        lineHeight: '1.5',
        margin: 0,
        padding: theme.spacing(1.5, 2, 1.5, 2.5),
        borderBottom: `1px solid ${theme.palette.border}`,
      }),
      sizeSmall: ({ theme }) => ({
        padding: theme.spacing(1, 2, 1, 2.5),
      }),
      head: ({ theme }) => ({
        wordBreak: 'break-word',
        overflow: 'hidden',
        color: theme.palette.textSubtle,
        fontWeight: 600,
        lineHeight: '1.5',
        fontSize: '0.6875rem',
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        borderBottom: `2px solid ${theme.palette.border}`,
      }),
    },
  },
  MuiTabs: {
    styleOverrides: {
      root: {
        minHeight: 40,
      },
      indicator: ({ theme }) => ({
        backgroundColor: theme.palette.primary.main,
        height: 2.5,
        borderRadius: '2px 2px 0 0',
      }),
    },
  },
  MuiTab: {
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.palette.textSubtle,
        minHeight: 36,
        textTransform: 'initial' as const,
        letterSpacing: '0.01em',
        borderRadius: 8,
        margin: theme.spacing(0, 0.5),
        padding: theme.spacing(0.75, 2),
        fontSize: '0.8125rem',
        fontWeight: 500,
        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          color: theme.palette.primary.main,
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.05)'
              : 'rgba(124, 58, 237, 0.06)',
        },
        '&.Mui-selected': {
          color: theme.palette.primary.main,
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.08)'
              : 'rgba(124, 58, 237, 0.08)',
          fontWeight: 600,
        },
        [theme.breakpoints.up('md')]: {
          minWidth: 120,
          fontSize: theme.typography.pxToRem(14),
          fontWeight: 500,
        },
      }),
      textColorPrimary: ({ theme }) => ({
        color: theme.palette.textSubtle,
      }),
    },
  },
  MuiTableSortLabel: {
    styleOverrides: {
      root: {
        color: 'inherit',
        '&:hover': {
          color: 'inherit',
        },
        '&:focus': {
          color: 'inherit',
        },
        '&:focus svg': {
          opacity: 0.5,
        },
        '&.Mui-active': {
          fontWeight: 'bold',
          color: 'inherit',
        },
      },
    },
  },
  MuiListItemText: {
    styleOverrides: {
      dense: {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 10,
        textTransform: 'none' as const,
        fontWeight: 600,
        letterSpacing: '0.01em',
        padding: '8px 20px',
        fontSize: '0.875rem',
        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      },
      text: {
        padding: '8px 14px',
      },
      contained: ({ theme }) => ({
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 1px 3px rgba(0, 0, 0, 0.3)'
            : '0 1px 3px rgba(124, 58, 237, 0.15)',
        '&:hover': {
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 4px 14px rgba(0, 0, 0, 0.4)'
              : '0 4px 14px rgba(124, 58, 237, 0.25)',
          transform: 'translateY(-1px)',
        },
        '&:active': {
          transform: 'translateY(0)',
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 1px 3px rgba(0, 0, 0, 0.3)'
              : '0 1px 3px rgba(124, 58, 237, 0.15)',
        },
      }),
      outlined: {
        borderWidth: 1.5,
        '&:hover': {
          borderWidth: 1.5,
        },
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: ({ theme }) => ({
        marginRight: theme.spacing(0.75),
        marginBottom: theme.spacing(0.75),
        borderRadius: 8,
        height: 28,
        border: `1px solid ${theme.palette.border}`,
        backgroundColor:
          theme.palette.mode === 'dark'
            ? 'rgba(255, 255, 255, 0.06)'
            : 'rgba(124, 58, 237, 0.04)',
        transition: 'all 200ms ease',
        '&:hover': {
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.10)'
              : 'rgba(124, 58, 237, 0.08)',
        },
      }),
      label: ({ theme }) => ({
        lineHeight: 1.4,
        fontWeight: 500,
        fontSize: '0.75rem',
        padding: theme.spacing(0, 1),
      }),
      labelSmall: ({ theme }) => ({
        fontSize: theme.spacing(1.5),
      }),
      deleteIcon: ({ theme }) => ({
        width: theme.spacing(2.25),
        height: theme.spacing(2.25),
        margin: theme.spacing(0, 0.75, 0, -0.5),
      }),
      deleteIconSmall: ({ theme }) => ({
        width: theme.spacing(2),
        height: theme.spacing(2),
        margin: theme.spacing(0, 0.5, 0, -0.5),
      }),
    },
  },
  MuiCard: {
    styleOverrides: {
      root: ({ theme }) => ({
        display: 'flex',
        flexDirection: 'column' as const,
        borderRadius: 16,
        backgroundColor:
          theme.palette.mode === 'dark'
            ? theme.palette.background.paper
            : theme.palette.background.paper,
        border: `1px solid ${theme.palette.border}`,
        boxShadow:
          theme.palette.mode === 'dark'
            ? 'none'
            : '0 1px 3px 0 rgba(124, 58, 237, 0.04), 0 1px 2px -1px rgba(124, 58, 237, 0.03)',
        transition:
          'box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1), border-color 300ms ease, transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 0 0 1px rgba(255, 255, 255, 0.08), 0 8px 32px rgba(0, 0, 0, 0.4)'
              : '0 8px 30px rgba(124, 58, 237, 0.08), 0 2px 8px rgba(124, 58, 237, 0.04)',
          borderColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.12)'
              : 'rgba(124, 58, 237, 0.15)',
          transform: 'translateY(-2px)',
        },
      }),
    },
  },
  MuiCardHeader: {
    styleOverrides: {
      root: {
        paddingBottom: 0,
      },
    },
  },
  MuiCardContent: {
    styleOverrides: {
      root: {
        flexGrow: 1,
        '&:last-child': {
          paddingBottom: undefined,
        },
      },
    },
  },
  MuiCardActions: {
    styleOverrides: {
      root: {
        justifyContent: 'flex-end',
      },
    },
  },
  MuiLink: {
    defaultProps: {
      underline: 'hover',
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: 'unset',
        borderRadius: 16,
      },
      elevation1: ({ theme }) => ({
        boxShadow:
          theme.palette.mode === 'dark'
            ? 'none'
            : '0 1px 3px rgba(124, 58, 237, 0.04)',
        border: `1px solid ${theme.palette.border}`,
        backgroundColor:
          theme.palette.mode === 'dark'
            ? theme.palette.background.paper
            : theme.palette.background.paper,
      }),
      elevation2: ({ theme }) => ({
        boxShadow:
          theme.palette.mode === 'dark'
            ? 'none'
            : '0 2px 8px rgba(124, 58, 237, 0.06)',
        backgroundColor:
          theme.palette.mode === 'dark'
            ? lighten(theme.palette.background.paper, 0.04)
            : '#FAFAFF',
      }),
      elevation4: ({ theme }) => ({
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 0 0 1px rgba(255, 255, 255, 0.06)'
            : '0 4px 16px rgba(124, 58, 237, 0.08)',
        backgroundColor:
          theme.palette.mode === 'dark'
            ? lighten(theme.palette.background.paper, 0.06)
            : '#F5F3FF',
      }),
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: ({ theme }) => ({
        borderRadius: 24,
        border:
          theme.palette.mode === 'dark'
            ? `1px solid ${theme.palette.border}`
            : '1px solid rgba(124, 58, 237, 0.08)',
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 24px 64px rgba(0, 0, 0, 0.5)'
            : '0 24px 48px rgba(124, 58, 237, 0.12)',
      }),
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: 10,
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.palette.border,
          transition: 'border-color 200ms ease, box-shadow 200ms ease',
        },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.15)'
              : 'rgba(124, 58, 237, 0.3)',
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.palette.primary.main,
          borderWidth: '1.5px',
          boxShadow:
            theme.palette.mode === 'dark'
              ? `0 0 0 3px rgba(167, 139, 250, 0.15)`
              : '0 0 0 3px rgba(124, 58, 237, 0.1)',
        },
      }),
    },
  },
  MuiFilledInput: {
    styleOverrides: {
      root: {
        borderRadius: '10px 10px 0 0',
      },
    },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: ({ theme }) => ({
        borderRadius: 8,
        backgroundColor: theme.palette.mode === 'dark' ? '#2A283E' : '#312E81',
        fontSize: '0.75rem',
        fontWeight: 500,
        padding: '6px 12px',
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 4px 16px rgba(0, 0, 0, 0.4)'
            : '0 4px 12px rgba(0, 0, 0, 0.15)',
      }),
    },
  },
  MuiMenuItem: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: 8,
        margin: '2px 4px',
        transition: 'background-color 150ms ease',
        '&:focus': {
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.05)'
              : 'rgba(124, 58, 237, 0.06)',
        },
        '&:hover': {
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.08)'
              : 'rgba(124, 58, 237, 0.06)',
        },
      }),
    },
  },
  MuiAlert: {
    styleOverrides: {
      root: {
        borderRadius: 12,
      },
    },
  },
  MuiLinearProgress: {
    styleOverrides: {
      root: {
        borderRadius: 9999,
        height: 6,
      },
    },
  },
  MuiBadge: {
    styleOverrides: {
      colorSecondary: ({ theme }) => ({
        backgroundColor: theme.palette.primary.main,
      }),
    },
  },
};
