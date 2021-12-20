const optionDefinitions: commandLineArgs.OptionDefinition[] = [
    { name: 'file', alias: 'f', type: String, defaultOption: true },
    { name: 'testnet', alias: 't', type: Boolean, defaultValue: false }
];

const args = commandLineArgs(optionDefinitions);
