import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ClipboardCheck, EllipsisVertical, KeyRound, ShieldOff, Trash2 } from 'lucide-react';
import type { User } from '../../types';
import { cn } from '../../lib/utils';

type UserRowActionsProps = {
  user: User;
  isStudent: boolean;
  onIec: boolean;
  onResetPassword: () => void;
  onResetTotp: () => void;
  onToggleIec: () => void;
  onDelete: () => void;
};

const itemClass =
  'flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 outline-none data-[highlighted]:bg-gray-100 data-[disabled]:cursor-not-allowed data-[disabled]:text-gray-400 data-[disabled]:data-[highlighted]:bg-transparent';

// AppAdmin's row actions, behind one button so the Actions column stays narrow.
// The menu renders in a portal, so the table's scroll box can't clip it on the last rows.
const UserRowActions: React.FC<UserRowActionsProps> = ({
  user,
  isStudent,
  onIec,
  onResetPassword,
  onResetTotp,
  onToggleIec,
  onDelete,
}) => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button
        type="button"
        title="Actions"
        aria-label={`Actions for ${user.email}`}
        className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 data-[state=open]:bg-gray-100"
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>
    </DropdownMenu.Trigger>

    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={4}
        collisionPadding={8}
        className="z-50 min-w-52 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
      >
        <DropdownMenu.Item className={itemClass} onSelect={onResetPassword}>
          <KeyRound className="h-4 w-4 text-primary-clr" />
          Reset password
        </DropdownMenu.Item>

        {isStudent && (
          <>
            {/* Nothing to reset until the student has set up an app */}
            <DropdownMenu.Item className={itemClass} disabled={!user.totpEnabledAt} onSelect={onResetTotp}>
              <ShieldOff className={cn('h-4 w-4', user.totpEnabledAt ? 'text-amber-600' : 'text-gray-300')} />
              Reset authenticator app
              {!user.totpEnabledAt && <span className="ml-auto pl-3 text-xs text-gray-400">Not set up</span>}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={onToggleIec}>
              <ClipboardCheck className={cn('h-4 w-4', onIec ? 'text-active-clr' : 'text-gray-400')} />
              {onIec ? 'Remove from IEC' : 'Appoint to IEC'}
            </DropdownMenu.Item>
          </>
        )}

        <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

        <DropdownMenu.Item
          className={cn(itemClass, 'text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700')}
          onSelect={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete user
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
);

export default UserRowActions;
