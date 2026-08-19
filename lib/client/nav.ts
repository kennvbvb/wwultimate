import type { ModeratorViewModel } from '../types.ts';

export type Page = 'home' | 'players' | 'roles' | 'assign' | 'night' | 'day' | 'end';

/**
 * Which tabs make sense right now.
 *
 * Every tab used to be tappable at every moment, so a moderator mid-night could
 * land on the role picker — a screen whose buttons the server rejects, which
 * reads as the app being broken. The phase the game is in decides what is
 * reachable; the page currently open always stays reachable so nobody can get
 * stuck looking at a disabled screen.
 */
export function availablePages(vm: ModeratorViewModel | null, current: Page): Set<Page> {
  const pages = new Set<Page>();
  if (!vm) return pages;

  /* A break keeps whatever was reachable before it. */
  const status = vm.paused ? vm.paused.from : vm.status;

  if (status === 'FINISHED') {
    pages.add('end');
  } else if (!vm.rolesLocked) {
    pages.add('players');
    pages.add('roles');
    if (vm.selectedRoles.length) pages.add('assign');
  } else if (status === 'FIRST_NIGHT' || status === 'NIGHT' || status === 'RESOLVE_NIGHT') {
    pages.add('night');
  } else if (status === 'DEATH_TRIGGER') {
    /* The trigger belongs to whichever phase raised it. */
    pages.add(vm.dayNumber > 0 && vm.night?.resolved ? 'day' : 'night');
  } else {
    pages.add('day');
  }

  pages.add(current);
  return pages;
}

/** Same routing table the Apps Script client used. */
export function routeByStatus(vm: ModeratorViewModel): Page {
  const status = vm.paused ? (vm.paused.from as ModeratorViewModel['status']) : vm.status;
  switch (status) {
    case 'SETUP': return vm.players.length ? 'roles' : 'players';
    case 'ROLE_ASSIGNMENT': return 'assign';
    case 'FIRST_NIGHT':
    case 'NIGHT':
    case 'RESOLVE_NIGHT': return 'night';
    case 'DEATH_TRIGGER': return vm.nightNumber && !vm.dayNumber ? 'night' : 'day';
    case 'DAWN':
    case 'DISCUSSION':
    case 'NOMINATION':
    case 'VOTING':
    case 'RESOLVE_DAY': return 'day';
    case 'FINISHED': return 'end';
    default: return 'day';
  }
}
