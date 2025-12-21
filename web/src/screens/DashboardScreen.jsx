import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  useTheme,
  alpha,
  Chip,
  Stack,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShoppingCart as ShoppingCartIcon,
  AttachMoney as AttachMoneyIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import { RegionalHeatmapCard } from '../components/RegionalHeatmapCard';
import { WineMapHeatmap } from '../components/WineMapHeatmap';
import { HelpIcon } from '../components/HelpIcon';

/**
 * KPI Widget Component
 * Displays key performance indicators with MD3 styling
 * 
 * Design Tokens Used:
 * - surfaceContainer: Card background
 * - primary/secondary/tertiary: For data visualization
 * - onSurface/onSurfaceVariant: Text colors
 * - outlineVariant: Border color
 */
export const KPIWidget = ({
  title,
  value,
  unit = '',
  changePercentage,
  isPositive = true,
  icon: Icon,
  accentColor,
  loading = false,
}) => {
  const theme = useTheme();
  const color = accentColor || theme.palette.primary.main;

  return (
    <Card
      sx={{
        backgroundColor: theme.palette.surfaceMedium,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '12px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease-in-out',
        '&:hover': {
          backgroundColor: theme.palette.surfaceDark,
          boxShadow: `0 2px 8px ${alpha(theme.palette.onSurface, 0.08)}`,
        },
      }}
    >
      <CardContent>
        {/* Header: Icon + Title */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography
              variant="h6"
              sx={{
                // Design Token: titleMedium
                color: theme.palette.onSurface,
                fontWeight: 500,
              }}
            >
              {title}
            </Typography>
            <HelpIcon 
              title={title}
              description={`Cet indicateur mesure ${title.toLowerCase()}. Comparez les variations mois après mois pour suivre les tendances de votre collection.`}
              sx={{ fontSize: '0.9rem' }}
            />
          </Box>
          <Box
            sx={{
              // Design Token: primaryContainer with opacity tint
              backgroundColor: alpha(color, 0.15),
              borderRadius: '8px',
              padding: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon sx={{ color, fontSize: 24 }} />
          </Box>
        </Box>

        {/* KPI Value Section */}
        {loading ? (
          <CircularProgress size={32} />
        ) : (
          <>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 1,
                marginBottom: 1.5,
              }}
            >
              <Typography
                variant="displaySmall"
                sx={{
                  // Design Token: displaySmall for KPI emphasis
                  color: theme.palette.onSurface,
                  fontWeight: 600,
                  fontSize: '2.25rem',
                }}
              >
                {value}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  // Design Token: onSurfaceVariant
                  color: theme.palette.onSurfaceVariant,
                }}
              >
                {unit}
              </Typography>
            </Box>

            {/* Change Indicator Badge */}
            <Chip
              icon={
                isPositive ? (
                  <TrendingUpIcon sx={{ fontSize: 16 }} />
                ) : (
                  <TrendingDownIcon sx={{ fontSize: 16 }} />
                )
              }
              label={`${changePercentage}% vs last month`}
              size="small"
              sx={{
                // Design Token: semantic color based on positive/negative
                backgroundColor: isPositive
                  ? alpha(theme.palette.tertiary, 0.3)
                  : alpha(theme.palette.error, 0.3),
                color: isPositive ? theme.palette.tertiary : theme.palette.error,
                borderRadius: '6px',
                height: 'auto',
                padding: '4px 8px',
                '& .MuiChip-icon': {
                  color: 'inherit',
                },
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * MD3-Compliant Data Table Component
 * Features:
 * - No vertical borders (horizontal dividers only)
 * - Row hover state with 8% opacity primary overlay
 * - Header with LabelLarge typography
 * - Sortable columns
 * 
 * Design Tokens Used:
 * - outlineVariant: Dividers
 * - surfaceContainer: Hover background
 * - primary: Row highlight on hover
 */
export const SaasDataTable = ({
  title,
  columns,
  rows,
  sortColumnIndex = 0,
  sortOrder = 'asc',
  onSort,
  loading = false,
  emptyState = 'No data available',
}) => {
  const theme = useTheme();
  const [localSortColumn, setLocalSortColumn] = useState(sortColumnIndex);
  const [localSortOrder, setLocalSortOrder] = useState(sortOrder);

  const handleSort = (columnIndex) => {
    const isAsc = localSortColumn === columnIndex && localSortOrder === 'asc';
    const newOrder = isAsc ? 'desc' : 'asc';

    setLocalSortColumn(columnIndex);
    setLocalSortOrder(newOrder);

    if (onSort) {
      onSort(columnIndex, newOrder);
    }
  };

  return (
    <Card
      sx={{
        backgroundColor: theme.palette.surfaceMedium,
        borderRadius: '12px',
        border: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      {/* Card Header */}
      {title && (
        <>
          <CardContent sx={{ paddingBottom: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="h5"
                sx={{
                  // Design Token: titleMedium for card headers
                  color: theme.palette.onSurface,
                  fontWeight: 500,
                }}
              >
                {title}
              </Typography>
              <HelpIcon 
                title={title}
                description="Tableau de bord montrant un aperçu détaillé. Cliquez sur les en-têtes pour trier les données."
                sx={{ fontSize: '0.9rem' }}
              />
            </Box>
          </CardContent>
          <Divider sx={{ borderColor: theme.palette.divider, marginTop: 1 }} />
        </>
      )}

      {/* Table */}
      <TableContainer sx={{ maxHeight: '600px' }}>
        <Table stickyHeader>
          {/* Table Head */}
          <TableHead>
            <TableRow
              sx={{
                // Design Token: surfaceContainerHigh for header emphasis
                backgroundColor: theme.palette.surfaceDark,
                '& .MuiTableCell-head': {
                  backgroundColor: theme.palette.surfaceDark,
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  borderRight: 'none', // NO vertical borders
                },
              }}
            >
              {columns.map((column, index) => (
                <TableCell
                  key={column.id}
                  align={column.align || 'left'}
                  sortDirection={
                    localSortColumn === index ? localSortOrder : false
                  }
                  sx={{
                    // Design Token: labelLarge for headers
                    color: theme.palette.onSurface,
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    padding: '16px',
                  }}
                >
                  {column.sortable ? (
                    <TableSortLabel
                      active={localSortColumn === index}
                      direction={
                        localSortColumn === index ? localSortOrder : 'asc'
                      }
                      onClick={() => handleSort(index)}
                      sx={{
                        color: theme.palette.onSurface,
                        '&.Mui-active': {
                          color: theme.palette.primary.main,
                        },
                      }}
                    >
                      {column.label}
                    </TableSortLabel>
                  ) : (
                    column.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          {/* Table Body */}
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  align="center"
                  sx={{ paddingY: 4 }}
                >
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  align="center"
                  sx={{
                    paddingY: 4,
                    color: theme.palette.onSurfaceVariant,
                  }}
                >
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, rowIndex) => (
                <TableRow
                  key={rowIndex}
                  sx={{
                    // Design Token: No vertical borders
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    '& .MuiTableCell-body': {
                      borderRight: 'none',
                      borderBottom: `1px solid ${theme.palette.divider}`,
                    },
                    // Design Token: 8% opacity primary overlay on hover
                    '&:hover': {
                      backgroundColor: alpha(
                        theme.palette.primary.main,
                        0.08
                      ),
                    },
                  }}
                >
                  {row.cells.map((cell, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      align={columns[cellIndex]?.align || 'left'}
                      sx={{
                        color: theme.palette.onSurface,
                        padding: '12px 16px',
                      }}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
};

/**
 * Complete Dashboard Screen
 * Includes KPI grid and data table with responsive layout
 */
export const DashboardScreen = () => {
  const theme = useTheme();
  const [sortConfig, setSortConfig] = useState({ column: 0, order: 'asc' });

  // Sample table data
  const tableColumns = [
    { id: 'product', label: 'Product', sortable: true, align: 'left' },
    { id: 'sales', label: 'Sales', sortable: true, align: 'center' },
    { id: 'revenue', label: 'Revenue', sortable: true, align: 'right' },
    { id: 'trend', label: 'Trend', sortable: false, align: 'center' },
  ];

  const tableData = [
    {
      cells: [
        'Premium Cabernet',
        '2,450',
        '$49,000',
        <Chip
          key="1"
          icon={<TrendingUpIcon />}
          label="+12%"
          size="small"
          sx={{
            backgroundColor: alpha(theme.palette.tertiary, 0.2),
            color: theme.palette.tertiary,
          }}
        />,
      ],
    },
    {
      cells: [
        'Rosé Selection',
        '1,890',
        '$37,800',
        <Chip
          key="2"
          icon={<TrendingDownIcon />}
          label="-5%"
          size="small"
          sx={{
            backgroundColor: alpha(theme.palette.error, 0.2),
            color: theme.palette.error,
          }}
        />,
      ],
    },
    {
      cells: [
        'Chardonnay Elite',
        '3,120',
        '$62,400',
        <Chip
          key="3"
          icon={<TrendingUpIcon />}
          label="+28%"
          size="small"
          sx={{
            backgroundColor: alpha(theme.palette.tertiary, 0.2),
            color: theme.palette.tertiary,
          }}
        />,
      ],
    },
    {
      cells: [
        'Merlot Reserve',
        '956',
        '$19,120',
        <Chip
          key="4"
          icon={<TrendingUpIcon />}
          label="+8%"
          size="small"
          sx={{
            backgroundColor: alpha(theme.palette.tertiary, 0.2),
            color: theme.palette.tertiary,
          }}
        />,
      ],
    },
  ];

  return (
    <Box
      sx={{
        padding: 3,
        backgroundColor: theme.palette.background.default,
        minHeight: '100vh',
      }}
    >
      <Stack spacing={3}>
        {/* KPI Section */}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <KPIWidget
              title="Total Sales"
              value="8,416"
              unit="bottles"
              changePercentage={15}
              isPositive={true}
              icon={ShoppingCartIcon}
              accentColor={theme.palette.primary.main}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <KPIWidget
              title="Revenue"
              value="$168.3K"
              changePercentage={22}
              isPositive={true}
              icon={AttachMoneyIcon}
              accentColor={theme.palette.tertiary.main}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <KPIWidget
              title="Avg Order Value"
              value="$89.4"
              changePercentage={8}
              isPositive={true}
              icon={AttachMoneyIcon}
              accentColor={theme.palette.secondary.main}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <KPIWidget
              title="Conversion Rate"
              value="3.8%"
              changePercentage={12}
              isPositive={true}
              icon={TrendingUpIcon}
              accentColor={theme.palette.primary.main}
            />
          </Grid>
        </Grid>

        {/* Data Table Section */}
        <Box>
          <SaasDataTable
            title="Product Performance"
            columns={tableColumns}
            rows={tableData}
            sortColumnIndex={sortConfig.column}
            sortOrder={sortConfig.order}
            onSort={(columnIndex, order) =>
              setSortConfig({ column: columnIndex, order })
            }
          />
        </Box>

        {/* Regional Heatmap and Additional Stats */}
        <Grid container spacing={2}>
          {/* Regional Heatmap Grid View */}
          <Grid item xs={12}>
            <RegionalHeatmapCard />
          </Grid>

          {/* Interactive Map Heatmap */}
          <Grid item xs={12}>
            <WineMapHeatmap />
          </Grid>

          {/* Recent Activity Card */}
          <Grid item xs={12} md={12}>
            <Card
              sx={{
                backgroundColor: theme.palette.surfaceMedium,
                borderRadius: '12px',
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <CardContent>
                <Typography variant="h6" sx={{ marginBottom: 2 }}>
                  Recent Activity
                </Typography>
                <Stack spacing={1.5} divider={<Divider />}>
                  {[
                    'Order #2451 completed - $2,890',
                    'New inventory received - 500 units',
                    'Customer feedback: 4.8/5 stars',
                    'Shipment dispatched - Order #2448',
                  ].map((activity, idx) => (
                    <Typography key={idx} variant="body2">
                      {activity}
                    </Typography>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>
    </Box>
  );
};

export default DashboardScreen;
