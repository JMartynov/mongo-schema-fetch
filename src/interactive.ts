import prompts from 'prompts';

export async function promptForCollections(allCollections: string[]): Promise<string[]> {
  if (allCollections.length <= 10) {
    return allCollections;
  }

  console.log(`\n⚠️ Detected ${allCollections.length} collections. Scanning all of them might take a while.`);

  const response = await prompts({
    type: 'multiselect',
    name: 'collections',
    message: 'Select the collections involved in your slow queries:',
    instructions: 'Press <space> to select, <a> to toggle all, <i> to invert selection',
    choices: allCollections.map(c => ({ title: c, value: c })),
    min: 1
  });

  return response.collections || [];
}
