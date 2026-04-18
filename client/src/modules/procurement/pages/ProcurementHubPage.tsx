import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SearchIcon from '@mui/icons-material/Search';
import {
  Button,
  Chip,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useMemo, useState } from 'react';
import { PageHeader } from '../../../components';

type ProcurementTab = 'invoices' | 'suppliers';

type InvoiceRow = {
  id: string;
  supplier: string;
  date: string;
  status: 'Pending' | 'Paid' | 'Needs review';
  amount: number;
  terms: string;
  updatedAt: string;
};

type SupplierRow = {
  id: string;
  name: string;
  contact: string;
  terms: string;
  status: 'Active' | 'Paused' | 'Needs setup';
  invoices: number;
  updatedAt: string;
};

const formatCurrency = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const invoiceRows: InvoiceRow[] = [
  {
    id: 'INV-0192',
    supplier: 'Sysco Foods',
    date: '2026-04-10',
    status: 'Pending',
    amount: 450,
    terms: 'Net 15',
    updatedAt: '2026-04-11T13:20:00.000Z'
  },
  {
    id: 'INV-0193',
    supplier: 'PepsiCo',
    date: '2026-04-11',
    status: 'Paid',
    amount: 120,
    terms: 'Net 30',
    updatedAt: '2026-04-11T16:05:00.000Z'
  },
  {
    id: 'INV-0194',
    supplier: 'US Foods',
    date: '2026-04-12',
    status: 'Needs review',
    amount: 780,
    terms: 'Net 15',
    updatedAt: '2026-04-12T12:10:00.000Z'
  }
];

const supplierRows: SupplierRow[] = [
  {
    id: 'SUP-001',
    name: 'Sysco Foods',
    contact: 'ap@sysco.com',
    terms: 'Net 15',
    status: 'Active',
    invoices: 12,
    updatedAt: '2026-04-11T13:20:00.000Z'
  },
  {
    id: 'SUP-002',
    name: 'PepsiCo',
    contact: 'billing@pepsico.com',
    terms: 'Net 30',
    status: 'Active',
    invoices: 4,
    updatedAt: '2026-04-11T16:05:00.000Z'
  },
  {
    id: 'SUP-003',
    name: 'Local Produce Co.',
    contact: 'orders@localproduce.example',
    terms: 'Weekly',
    status: 'Needs setup',
    invoices: 1,
    updatedAt: '2026-04-12T10:50:00.000Z'
  }
];

const renderStatusChip = (value: string) => {
  const color =
    value === 'Paid' || value === 'Active'
      ? 'success'
      : value === 'Pending'
        ? 'warning'
        : value === 'Paused'
          ? 'default'
          : 'info';
  return <Chip size="small" label={value} color={color} variant={color === 'default' ? 'outlined' : 'filled'} />;
};

const renderSummaryChips = (tab: ProcurementTab) =>
  tab === 'invoices'
    ? [
        { label: `${invoiceRows.filter((row) => row.status === 'Pending').length} open`, color: 'warning' as const },
        { label: `${invoiceRows.filter((row) => row.status === 'Paid').length} paid`, color: 'success' as const },
        { label: `${formatCurrency(invoiceRows.reduce((sum, row) => sum + row.amount, 0))} total`, color: 'default' as const }
      ]
    : [
        { label: `${supplierRows.filter((row) => row.status === 'Active').length} active`, color: 'success' as const },
        { label: `${supplierRows.filter((row) => row.status === 'Needs setup').length} setup`, color: 'info' as const },
        { label: `${supplierRows.reduce((sum, row) => sum + row.invoices, 0)} linked invoices`, color: 'default' as const }
      ];

export const ProcurementHubPage = () => {
  const [tab, setTab] = useState<ProcurementTab>('invoices');
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [invoicePage, setInvoicePage] = useState(0);
  const [supplierPage, setSupplierPage] = useState(0);
  const rowsPerPage = 5;

  const filteredInvoices = useMemo(
    () =>
      invoiceRows.filter((row) => {
        const query = invoiceQuery.trim().toLowerCase();
        if (!query) return true;
        return [row.id, row.supplier, row.status, row.terms].some((value) =>
          value.toLowerCase().includes(query)
        );
      }),
    [invoiceQuery]
  );

  const filteredSuppliers = useMemo(
    () =>
      supplierRows.filter((row) => {
        const query = supplierQuery.trim().toLowerCase();
        if (!query) return true;
        return [row.id, row.name, row.contact, row.status, row.terms].some((value) =>
          value.toLowerCase().includes(query)
        );
      }),
    [supplierQuery]
  );

  const invoiceSlice = filteredInvoices.slice(invoicePage * rowsPerPage, invoicePage * rowsPerPage + rowsPerPage);
  const supplierSlice = filteredSuppliers.slice(
    supplierPage * rowsPerPage,
    supplierPage * rowsPerPage + rowsPerPage
  );

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Procurement"
        subtitle="Manage invoice and supplier workflows together."
        icon={<ReceiptLongIcon />}
      />

      <Paper sx={{ p: 1 }}>
        <Tabs
          value={tab}
          onChange={(_event, value: ProcurementTab) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab value="invoices" label="Invoices" />
          <Tab value="suppliers" label="Suppliers" />
        </Tabs>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h6" fontWeight={900}>
                {tab === 'invoices' ? 'Invoice queue' : 'Supplier directory'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {tab === 'invoices'
                  ? 'Scan due items, review status, and keep procurement moving.'
                  : 'Track supplier readiness, payment terms, and linked invoice volume.'}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {renderSummaryChips(tab).map((chip) => (
                <Chip key={chip.label} size="small" label={chip.label} color={chip.color} variant="outlined" />
              ))}
            </Stack>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ md: 'center' }}>
            <Button variant="contained" startIcon={<AddCircleOutlineIcon />}>
              {tab === 'invoices' ? 'Create invoice' : 'Add supplier'}
            </Button>
            <TextField
              size="small"
              fullWidth
              value={tab === 'invoices' ? invoiceQuery : supplierQuery}
              onChange={(event) => {
                if (tab === 'invoices') {
                  setInvoiceQuery(event.target.value);
                  setInvoicePage(0);
                  return;
                }
                setSupplierQuery(event.target.value);
                setSupplierPage(0);
              }}
              placeholder={tab === 'invoices' ? 'Search invoices...' : 'Search suppliers...'}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                )
              }}
            />
            <Button variant="outlined" startIcon={<FilterAltOutlinedIcon />}>
              Filters
            </Button>
          </Stack>

          {tab === 'invoices' ? (
            <Stack spacing={1.5}>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 840 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Invoice ID</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Supplier</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Amount
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Terms</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {invoiceSlice.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell sx={{ fontWeight: 700 }}>{row.id}</TableCell>
                        <TableCell>{row.supplier}</TableCell>
                        <TableCell>{row.date}</TableCell>
                        <TableCell>{renderStatusChip(row.status)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatCurrency(row.amount)}
                        </TableCell>
                        <TableCell>{row.terms}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button size="small" variant="text">
                              View
                            </Button>
                            <Button size="small" variant="text">
                              Edit
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={filteredInvoices.length}
                page={invoicePage}
                onPageChange={(_event, nextPage) => setInvoicePage(nextPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={() => setInvoicePage(0)}
                rowsPerPageOptions={[rowsPerPage]}
              />
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 840 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Supplier</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Contact</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Terms</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Linked invoices
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {supplierSlice.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell sx={{ fontWeight: 700 }}>
                          <Stack spacing={0.25}>
                            <Typography variant="body2" fontWeight={700}>
                              {row.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Updated {row.updatedAt.slice(0, 10)}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>{row.contact}</TableCell>
                        <TableCell>{row.terms}</TableCell>
                        <TableCell>{renderStatusChip(row.status)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {row.invoices}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button size="small" variant="text">
                              Open
                            </Button>
                            <Button size="small" variant="text">
                              Review
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={filteredSuppliers.length}
                page={supplierPage}
                onPageChange={(_event, nextPage) => setSupplierPage(nextPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={() => setSupplierPage(0)}
                rowsPerPageOptions={[rowsPerPage]}
              />
            </Stack>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
};
