# SocialStack Tools

This is a command line interface for creating, managing and compiling the UI's of SocialStack projects.

# Installation

`npm install -g socialstack`

# Configuration

A few actions that the socialstack tools perform require MySQL admin rights on a development machine. This is so it can, for example, automatically create development databases for you. Whilst optional, it's a good idea to set this access up. Create this in the config file found here:

Windows:

`%AppData%\socialstack\settings.json`

Debian Linux:

`/{username}/.config/socialstack/settings.json`

Or find it via running:

`socialstack configuration`

The file needs to contain the account details for a local (on your development machine) MySQL user account with the ability to create and manage databases. Here's an example settings.json:

```
{
    "databases": {
        "local": {
            "username": "sstools",
            "password": "sstools!",
            "server": "localhost"
        }
    }
}
```

And to create the account on your MySQL instance, run this (changing the username/ password as you see fit, just ensuring it matches your settings.json):

```
	-- Create the user account:
	CREATE USER 'sstools'@'localhost' IDENTIFIED BY 'sstools!';
	-- Grant that user full access to the db:
	GRANT ALL PRIVILEGES ON *.* TO 'sstools'@'localhost' WITH GRANT OPTION;
	FLUSH PRIVILEGES;
```

# Basic usage

SocialStack tools are used directly by a running API (unless disabled, which you can do by just omitting your UI/Source directory), so typically in development to use the file watcher you just need to start your API.

## Dependencies

Currently socialstack projects require the following:

* Node.js 8+
* [.NET Core 2.2 SDK](https://dotnet.microsoft.com/download/dotnet-core/2.2). If you're not sure if you already have this installed, you can run `dotnet --list-sdks` to find out.
* MySQL. Version 8 is recommended.

## Creating a project

`socialstack create`

Run this to create a new blank SocialStack project in your working directory. Optionally provide it a domain name like this:

`socialstack create example.com`
 
This will also create a database for you too, if you've setup your database config (see above).

## Installing modules

`socialstack i Api/HelloWorld`

This will install the named module(s) from any repositories you have configured, as a submodule. You can list multiple here to install them all.

## Watching for UI changes

`socialstack watch`

This will start a watcher which checks for changes in your UI/Source and Admin/Source directories. When a change happens, your UI will be rebuilt. This process doesn't exit.

## One off UI builds

`socialstack buildui`

This builds UI/Source and Admin/Source, then quits.

## SSMF - SocialStack Migration Framework

In the future this will be used to automatically convert websites to or from other frameworks via simple, shared commands.

# Contributing

To make changes to socialstack tools itself, it's a good idea to also grab the [React lite builder](https://source.socialstack.cf/infrastructure/react-lite-builder) project:

* Clone both this repository and react-lite-builder
* Run `npm install` in each. This'll download the modules they each depend on.
* Run `npm link` inside the react-lite-builder directory. This makes it available as an npm link.
* Run `npm link react-lite-builder` inside the tools directory. This uses the link you just made.

Linking like this means you can change files in react-lite-builder and have those changes available directly to what you're working on in the tools directory.

To test out your tools changes, open up a command prompt in a socialstack project, then run:

`node C:/path/to/socialstack-tools-checkout/bin/socialstack.js ...`

where ... is the command line args you want to try, as if you'd run `socialstack ...` instead.

If everything is good, it's the usual `npm version patch` and `npm version publish` from an authed npm account.