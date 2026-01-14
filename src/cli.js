#!/usr/bin/env node

import { Command } from 'commander';
import devices from './commands/devices.js';
import profiles from './commands/profiles.js';

const program = new Command();

program
    .name('stream-deck-utility')
    .description('CLI utility for managing Stream Deck profiles across devices')
    .version('1.0.0');

program.addCommand(devices);
program.addCommand(profiles);

program.parse();
