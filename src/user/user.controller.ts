import { Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

@Controller('users')
export class UserController {
  @Get()
  findAll(@Query('page') page = 1, @Query('limit') limit = 10): string {
    return `Users list (page: ${page}, limit: ${limit})`;
  }

  @Get(':id')
  findOne(@Param('id') id: string): string {
    return `User with ID ${id}`;
  }

  @Post()
  create(): string {
    return 'User created';
  }

  @Put(':id')
  update(@Param('id') id: string): string {
    return `User ${id} updated`;
  }

  @Delete(':id')
  remove(@Param('id') id: string): string {
    return `User ${id} deleted`;
  }
}
