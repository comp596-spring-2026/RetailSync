import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import GroupIcon from "@mui/icons-material/Group";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../../app/store/hooks";
import { showSnackbar } from "../../../app/store/uiSlice";
import {
  LoadingEmptyStateWrapper,
  NoAccess,
  PageHeader,
  RetailSurfaceCard,
  RetailSurfaceCardBody,
} from "../../../components";
import { hasPermission } from "../../../utils/permissions";
import { extractApiErrorMessage } from "../../../utils/apiError";
import {
  assignRoleThunk,
  createInviteThunk,
  deleteInviteThunk,
  deleteUserThunk,
  fetchUsersPageData,
  selectInvites,
  selectUsers,
  selectUsersLoading,
  selectUsersMutating,
  updateUserThunk,
  type UserItem,
} from "../state";
import { selectRoles } from "../../rbac/state";
import {
  DeleteMemberDialog,
  EditMemberModal,
  InviteMemberModal,
  PendingInvitesSection,
} from "../components";
import {
  canAssignMemberRole,
  canDeleteMember,
  canEditMember,
  isCurrentUser,
  isProtectedAdminMember,
  memberStatusLabel,
  type MemberUser,
} from "../utils/memberAccess";

const PROTECTED_TOOLTIP =
  "Protected admin account cannot be edited or removed.";
const SELF_ROLE_TOOLTIP = "You cannot change your own role.";

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

type UsersPageProps = {
  showHeader?: boolean;
};

type StatusFilter = "all" | "active" | "inactive";

export const UsersPage = ({ showHeader = true }: UsersPageProps) => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const currentUser = useAppSelector((state) => state.auth.user);
  const canView = hasPermission(permissions, "users", "view");
  const canInvite = hasPermission(permissions, "users", "actions:invite");
  const canRevokeInvite = hasPermission(permissions, "users", "delete");
  const users = useAppSelector(selectUsers);
  const roles = useAppSelector(selectRoles);
  const invites = useAppSelector(selectInvites);
  const loading = useAppSelector(selectUsersLoading);
  const mutating = useAppSelector(selectUsersMutating);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editMember, setEditMember] = useState<MemberUser | null>(null);
  const [deleteMember, setDeleteMember] = useState<MemberUser | null>(null);

  useEffect(() => {
    if (canView) {
      void dispatch(fetchUsersPageData());
    }
  }, [canView, dispatch]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const status = memberStatusLabel(user);
      if (statusFilter === "active" && status !== "Active") return false;
      if (statusFilter === "inactive" && status !== "Inactive") return false;
      if (roleFilter !== "all" && user.roleId?._id !== roleFilter) return false;
      if (!query) return true;
      const haystack =
        `${user.firstName} ${user.lastName} ${user.email} ${user.roleId?.name ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [roleFilter, search, statusFilter, users]);

  const runMutation = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(error, "Something went wrong"),
          severity: "error",
        }),
      );
      throw error;
    }
  };

  const handleInvite = async (payload: { email: string; roleId: string }) => {
    try {
      await runMutation(() =>
        dispatch(createInviteThunk({ ...payload, expiresInDays: 7 })).unwrap(),
      );
      setInviteOpen(false);
    } catch {
      // snackbar shown
    }
  };

  const handleEditSave = async (payload: {
    userId: string;
    firstName: string;
    lastName: string;
    roleId?: string;
  }) => {
    const member = editMember;
    if (!member) return;
    const shouldUpdateName = canEditMember(member, currentUser, permissions);
    const shouldAssignRole =
      payload.roleId && canAssignMemberRole(member, currentUser, permissions);

    try {
      await runMutation(async () => {
        if (shouldUpdateName) {
          await dispatch(
            updateUserThunk({
              userId: payload.userId,
              firstName: payload.firstName,
              lastName: payload.lastName,
            }),
          ).unwrap();
        }
        if (shouldAssignRole && payload.roleId) {
          await dispatch(
            assignRoleThunk({ userId: payload.userId, roleId: payload.roleId }),
          ).unwrap();
        }
      });
      setEditMember(null);
    } catch {
      // snackbar shown
    }
  };

  const handleDelete = async () => {
    if (!deleteMember) return;
    try {
      await runMutation(() =>
        dispatch(deleteUserThunk(deleteMember._id)).unwrap(),
      );
      setDeleteMember(null);
    } catch {
      // snackbar shown
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    await runMutation(() => dispatch(deleteInviteThunk(inviteId)).unwrap());
  };

  const openEdit = (user: UserItem) => {
    setEditMember(user);
  };

  const openAssignRole = (user: UserItem) => {
    setEditMember(user);
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      {showHeader ? (
        <PageHeader
          title="Users"
          subtitle="Manage team members and their access roles"
          icon={<GroupIcon />}
        />
      ) : null}

      {canView && !canInvite ? (
        <Alert severity="info">
          You can view team members, but inviting new members requires the{' '}
          <strong>Invite users</strong> permission under Users in Roles &amp; Permissions.
        </Alert>
      ) : null}

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={false}
        loadingLabel="Loading members..."
      >
        <RetailSurfaceCard>
          <RetailSurfaceCardBody>
            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
              spacing={2}
              sx={{ mb: 2 }}
            >
              <Box>
                <Typography
                  variant="h6"
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <GroupIcon fontSize="small" color="primary" />
                  Members
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Manage team members and their access roles.
                </Typography>
              </Box>
              {canInvite ? (
                <Button
                  data-testid="invite-member-add"
                  variant="contained"
                  color="success"
                  startIcon={<AddIcon />}
                  onClick={() => setInviteOpen(true)}
                >
                  Add
                </Button>
              ) : null}
            </Stack>

            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{ mb: 2 }}
            >
              <TextField
                size="small"
                label="Search members"
                placeholder="Name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ minWidth: 220, flex: 1 }}
              />
              <Select
                size="small"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                sx={{ minWidth: 180 }}
                displayEmpty
              >
                <MenuItem value="all">All roles</MenuItem>
                {roles.map((role) => (
                  <MenuItem key={role._id} value={role._id}>
                    {role.name}
                  </MenuItem>
                ))}
              </Select>
              <Select
                size="small"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="all">All statuses</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Joined</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">
                        No members match your filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const member = user as MemberUser;
                    const protectedAdmin = isProtectedAdminMember(member);
                    const self = isCurrentUser(member, currentUser);
                    const showEdit = canEditMember(
                      member,
                      currentUser,
                      permissions,
                    );
                    const showDelete = canDeleteMember(
                      member,
                      currentUser,
                      permissions,
                    );
                    const showAssign = canAssignMemberRole(
                      member,
                      currentUser,
                      permissions,
                    );
                    const roleName = user.roleId?.name ?? "—";

                    return (
                      <TableRow key={user._id} hover>
                        <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={roleName}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={memberStatusLabel(member)}
                            color={
                              member.isActive === false ? "default" : "success"
                            }
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{formatDate(user.createdAt)}</TableCell>
                        <TableCell align="right">
                          {protectedAdmin ? (
                            <Tooltip title={PROTECTED_TOOLTIP}>
                              <Chip
                                size="small"
                                label="Protected"
                                variant="outlined"
                              />
                            </Tooltip>
                          ) : self ? (
                            <Tooltip title={SELF_ROLE_TOOLTIP}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                You
                              </Typography>
                            </Tooltip>
                          ) : (
                            <Stack
                              direction="row"
                              spacing={0.5}
                              justifyContent="flex-end"
                            >
                              {showEdit ? (
                                <Tooltip title="Edit member">
                                  <IconButton
                                    size="small"
                                    onClick={() => openEdit(user)}
                                    disabled={mutating}
                                  >
                                    <EditOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : null}
                              {showAssign ? (
                                <Tooltip title="Change role">
                                  <IconButton
                                    size="small"
                                    onClick={() => openAssignRole(user)}
                                    disabled={mutating}
                                  >
                                    <SwapHorizIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : null}
                              {showDelete ? (
                                <Tooltip title="Remove member">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => setDeleteMember(member)}
                                    disabled={mutating}
                                  >
                                    <DeleteOutlineIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : null}
                            </Stack>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </RetailSurfaceCardBody>
        </RetailSurfaceCard>

        <RetailSurfaceCard>
          <RetailSurfaceCardBody>
            <PendingInvitesSection
              invites={invites}
              canRevoke={canRevokeInvite}
              mutating={mutating}
              onRevoke={handleRevokeInvite}
            />
          </RetailSurfaceCardBody>
        </RetailSurfaceCard>
      </LoadingEmptyStateWrapper>

      <InviteMemberModal
        open={inviteOpen}
        roles={roles}
        mutating={mutating}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleInvite}
      />

      <EditMemberModal
        open={Boolean(editMember)}
        member={editMember}
        roles={roles}
        canEditName={
          editMember
            ? canEditMember(editMember, currentUser, permissions)
            : false
        }
        canAssignRole={
          editMember
            ? canAssignMemberRole(editMember, currentUser, permissions)
            : false
        }
        mutating={mutating}
        onClose={() => setEditMember(null)}
        onSave={handleEditSave}
      />

      <DeleteMemberDialog
        open={Boolean(deleteMember)}
        member={deleteMember}
        mutating={mutating}
        onClose={() => setDeleteMember(null)}
        onConfirm={handleDelete}
      />
    </Stack>
  );
};
