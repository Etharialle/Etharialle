# C++ Resources

I am learning C++ on my own.  Since this is not my full time job, having some notes dedicated to some of the processes and explanation for future review is helpful.

- [C++ Reference](https://en.cppreference.com/w/)
- [SDL2 Wiki](https://wiki.libsdl.org/SDL2/FrontPage)
- 

## Setting Up My Environment

### Compiler

For this project I am using gcc since it seems pretty easy to start with.  Most of the compiling effort is done with the build system anyway

### File Structure

When creating the repo on GitHub I used a capital `S` for the project, otherwise all my own files and directories I plan to use lower case.

[Serenity](https://github.com/Etharialle/Serenity)

Currently all the code is in the src directory.  The plan is to split that out so headers are in a subdirectory and includes (external libaries) are in a separate directory.

```plaintext
Serenity/
├── assets/
|   └── BUILD
├── docs/
|   └── plan.md
├── src/
|   ├── FastNoiseLite.h
|   ├── game_map.cc
|   ├── game_map.h
|   └── main.cc
├── .bazelrc
├── .gitignore
├── BUILD
├── LICENSE
├── MODULE.bazel
├── README.md
├── STYLEGUIDE.md
└── WORKSPACE
```


### Build System

#### Bazel

Currently I am using Bazel for a build system.

##### Steps For Setting Up The Build

1) Create `WORKSPACE` file in root directory
   
2) Create `MODULE.bazel` file in root directory

3) create `BUILD` file in root directory
   
4) Create `.bazelrc` file in root directory

##### Bazel Commands

**Build Commands**

Running `bazel build serenity` tells bazel to compile the binary named "serenity" in the `BUILD` file.  If the `BUILD` file is not in the root directory of the project then `//<path to BUILD>:name` would used such as `bazel build //src:serenity` if the `BUILD` file was in the `src` directory and the name in the `cc_binary` rule was still "serenity"

by default the binary is stored in `project-root/bazel-bin/` so from the root directory the following would be used to run the binary: `./bazel-bin/serenity`

#### CMake

I previosuly tried CMake and it's quite a headache for me.  I'll revisit this later.

## Serenity Project

### Planning

- [X] Add Jira Board Link [Serenity Jira](https://etharialle.atlassian.net/jira/software/projects/SNY/boards/3/backlog?epics=visible)
- [ ] Refine backlog

### External Libaries

Detail usage of external libaries, what features I use and how I use them

### Testing

I'm not currently doing Test Driven Development (TDD), but may consider in the future.  However, I do want to make sure certain test case are run.

- Unit Testing of Code
- Integration Testing of Different Components